-- Testing an n8n workflow change before it goes live. The edited workflow is a dev
-- copy whose webhook path ends in the suffix (e.g. wf3-send-outreach-dev), so both
-- copies can be active and real clients keep hitting the live path. Setting
-- platform_settings.sandbox_webhook_suffix = '-dev' points every sandbox button
-- (Run next step, Simulate reply, Advance time) at the dev copies; clearing it
-- (null) points them back at the live workflows. Only sandbox-initiated calls go
-- through sandbox_fire, so production traffic is never affected by the setting.
alter table public.platform_settings add column if not exists sandbox_webhook_suffix text;

create or replace function public.sandbox_fire(p_path text, p_body jsonb)
 returns bigint
 language sql
 security definer
 set search_path to 'public'
as $function$
  select net.http_post(
    url := 'https://n8n.shortyharris.com/webhook/' || p_path
           || coalesce((select nullif(btrim(sandbox_webhook_suffix), '') from public.platform_settings where id = 1), ''),
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000);
$function$;
