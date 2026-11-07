import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  answersFromProfile, type MissingField, type WizardAnswers, type WizardEntry, type WizardScreen,
} from '../lib/wizardSession';

export interface WizardSessionRow {
  id: string;
  client_id: string;
  entry_point: WizardEntry;
  screen: WizardScreen;
  answers: WizardAnswers;
  status: 'open' | 'completed' | 'abandoned';
  updated_at: string;
}

const COLS = 'id, client_id, entry_point, screen, answers, status, updated_at';

export async function fetchOpenSession(clientId: string, client: SupabaseClient = supabase): Promise<WizardSessionRow | null> {
  const { data, error } = await client
    .from('wizard_sessions')
    .select(COLS)
    .eq('client_id', clientId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WizardSessionRow | null) ?? null;
}

/** Starts a session. Any older open session is closed first (one open per client). */
export async function startSession(
  clientId: string, entry: WizardEntry, answers: WizardAnswers, screen: WizardScreen,
  client: SupabaseClient = supabase,
): Promise<WizardSessionRow> {
  await client.from('wizard_sessions').update({ status: 'abandoned' }).eq('client_id', clientId).eq('status', 'open');
  const { data, error } = await client
    .from('wizard_sessions')
    .insert({ client_id: clientId, entry_point: entry, answers, screen })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as WizardSessionRow;
}

export async function saveSession(
  id: string, patch: { answers?: WizardAnswers; screen?: WizardScreen },
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client.from('wizard_sessions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export type ConfirmResult =
  | { ok: true }
  | { ok: false; error: 'missing_fields'; missing: MissingField[] }
  | { ok: false; error: string };

export async function confirmProfile(id: string, client: SupabaseClient = supabase): Promise<ConfirmResult> {
  const { data, error } = await client.rpc('confirm_wizard_profile', { p_session_id: id });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; missing?: MissingField[] };
  if (r.ok) return { ok: true };
  if (r.error === 'missing_fields') return { ok: false, error: 'missing_fields', missing: r.missing ?? [] };
  return { ok: false, error: r.error ?? 'unknown_error' };
}

/** The client's saved profile as wizard answers (returning users, "Find new campaigns"). */
export async function fetchSavedProfile(clientId: string, client: SupabaseClient = supabase): Promise<WizardAnswers> {
  const [clientRes, icpRes, svcRes] = await Promise.all([
    client.from('clients').select('business_name').eq('id', clientId).single(),
    client.from('client_icp')
      .select('industry, business_description, target_business_types, decision_maker_roles, target_locations, company_size, exclusions, goal, cta')
      .eq('client_id', clientId).maybeSingle(),
    client.from('client_services').select('name, seasonal_months, source').eq('client_id', clientId).order('position'),
  ]);
  const icp = icpRes.data as (Record<string, unknown> & { target_locations?: string[] | null }) | null;
  return answersFromProfile({
    businessName: (clientRes.data?.business_name as string | undefined) ?? null,
    icp: icp as Parameters<typeof answersFromProfile>[0]['icp'],
    services: (svcRes.data ?? []) as { name: string; seasonal_months: number[] | null; source: string }[],
    areas: (icp?.target_locations ?? []).map((label) => ({ mode: 'text' as const, label })),
  });
}

/**
 * Autosave: keeps the latest answers in memory and writes them at most every `delayMs`, plus
 * immediately when asked (screen change, leaving the page). Returns the save state for the UI.
 */
export function useAutosave(
  sessionId: string | null,
  client: SupabaseClient = supabase,
  delayMs = 800,
) {
  const pending = useRef<{ answers?: WizardAnswers; screen?: WizardScreen } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved');

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    if (!sessionId || !patch) return;
    pending.current = null;
    setState('saving');
    try {
      await saveSession(sessionId, patch, client);
      setState(pending.current ? 'saving' : 'saved');
    } catch {
      // Keep the unsaved change so the next save retries it.
      pending.current = { ...patch, ...(pending.current ?? {}) };
      setState('error');
    }
  }, [sessionId, client]);

  const queue = useCallback((patch: { answers?: WizardAnswers; screen?: WizardScreen }) => {
    pending.current = { ...(pending.current ?? {}), ...patch };
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, delayMs);
  }, [flush, delayMs]);

  // Save whatever is left when the wizard closes.
  useEffect(() => () => { void flush(); }, [flush]);

  return { queue, flush, state };
}
