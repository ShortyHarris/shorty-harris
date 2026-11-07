import { describe, it, expect } from 'vitest';
import { loadNodeCode, runNode } from './runNode';

// WF2 / WF5 > Build Template Instruction (Campaign Wizard M5): a campaign with a four-email
// template has the AI personalise that template; a campaign without one keeps today's prompt.
const code = loadNodeCode('wf2-template-instruction.js');
const sequence = [
  { subject: 'Lawn care for {{company_name}}', body: 'Hi {{first_name}},\n\nWe look after commercial lawns.\n\n{{sender_name}}' },
  { subject: 'Quick follow-up', body: 'Hi {{first_name}}, any interest?' },
  { subject: 'One more idea', body: 'Hi {{first_name}}, a thought.' },
  { subject: 'Closing the loop', body: 'Hi {{first_name}}, last note.' },
];

function build(fields: Record<string, unknown>) {
  const [out] = runNode(code, { 'Template Input': [{
    message_type: 'initial', campaign_sequence: sequence, campaign_language: 'English',
    prospect_business: 'Bridger Properties', prospect_contact: 'Dana Smith', sender_name: 'Ian', ...fields,
  }] }, { now: '2026-11-07T10:00:00Z' });
  return out.json as Record<string, unknown>;
}

describe('Build Template Instruction', () => {
  it('picks the template email for each step', () => {
    expect(build({ message_type: 'initial' }).template_subject).toBe('Lawn care for {{company_name}}');
    expect(build({ message_type: 'follow_up_d3' }).step).toBe(1);
    expect(build({ message_type: 'follow_up_d14' }).template_subject).toBe('Closing the loop');
  });

  it('fills placeholders for the fallback copy', () => {
    const r = build({});
    expect(r.prefilled_subject).toBe('Lawn care for Bridger Properties');
    expect(r.prefilled_body).toBe('Hi Dana,\n\nWe look after commercial lawns.\n\nIan');
    expect(build({ prospect_contact: '', prospect_business: '' }).prefilled_body).toContain('Hi there,');
  });

  it('tells the AI to personalise, not rewrite, and never to invent claims', () => {
    const p = String(build({ campaign_language: 'Czech' }).prompt_instruction);
    expect(p).toContain('Personalise it for this prospect');
    expect(p).toContain('Do not add claims');
    expect(p).toContain('Write in Czech.');
    expect(p).toContain('Template body:\nHi {{first_name}},');
  });

  it('accepts the sequence as JSON text too', () => {
    expect(build({ campaign_sequence: JSON.stringify(sequence) }).has_template).toBe(true);
  });

  it('without a template, or with a blank step, keeps today\'s prompt', () => {
    expect(build({ campaign_sequence: null })).toEqual({ has_template: false, step: 0, prompt_instruction: '' });
    expect(build({ campaign_sequence: [{ subject: '', body: 'x' }] }).has_template).toBe(false);
    expect(build({ campaign_sequence: 'not json' }).has_template).toBe(false);
    expect(build({ message_type: 'something_else' }).prompt_instruction).toBe('');
  });
});
