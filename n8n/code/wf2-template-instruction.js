// WF2 (first email) and WF5 (follow-ups) > Build Template Instruction
// Campaign Wizard (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md, M5): when the campaign has a four-email
// template (campaigns.sequence), the AI personalises that template for this prospect instead
// of writing from scratch. Without a template, prompt_instruction is empty and the existing
// prompt runs exactly as before.
//
// Input: a Set node named "Template Input" with
//   message_type      initial | follow_up_d3 | follow_up_d7 | follow_up_d14
//   campaign_sequence campaigns.sequence (array of { subject, body }) or null
//   campaign_language campaigns.language
//   prospect_business, prospect_contact, sender_name
// Output: has_template, step (0-3), template_subject, template_body, prefilled_subject,
//   prefilled_body (placeholders filled, used if the AI call fails), prompt_instruction
//   (append to the existing Gemini prompt).
const input = $('Template Input').item.json;
const STEP = { initial: 0, follow_up_d3: 1, follow_up_d7: 2, follow_up_d14: 3 };
const step = STEP[input.message_type];

let sequence = input.campaign_sequence;
if (typeof sequence === 'string') {
  try { sequence = JSON.parse(sequence); } catch (e) { sequence = null; }
}
const email = Array.isArray(sequence) && step !== undefined ? sequence[step] : null;
const subject = email && typeof email.subject === 'string' ? email.subject.trim() : '';
const body = email && typeof email.body === 'string' ? email.body.trim() : '';

if (!subject || !body) {
  return [{ json: { has_template: false, step: step ?? null, prompt_instruction: '' } }];
}

const firstName = String(input.prospect_contact || '').trim().split(/\s+/)[0] || '';
const values = {
  first_name: firstName || 'there',
  company_name: String(input.prospect_business || '').trim() || 'your team',
  sender_name: String(input.sender_name || '').trim(),
};
const fill = (text) => text.replace(/\{\{\s*(first_name|company_name|sender_name)\s*\}\}/g, (m, k) => values[k]);

const instruction = [
  'The sender wrote this email template for the campaign. Personalise it for this prospect.',
  '- Keep the offer, the ask and the overall length. Do not add claims, prices, guarantees or results that are not in the template.',
  '- You may adjust one or two sentences to mention something specific and true about the prospect\'s business, if you know it. Otherwise keep the template as written.',
  `- Write in ${input.campaign_language || 'English'}.`,
  '- Fill {{first_name}}, {{company_name}} and {{sender_name}} with the real values. Do not leave any {{...}} in the email.',
  '- Do not add an unsubscribe line or postal address; they are added afterwards.',
  '',
  'Template subject:',
  subject,
  '',
  'Template body:',
  body,
].join('\n');

return [{
  json: {
    has_template: true,
    step,
    template_subject: subject,
    template_body: body,
    prefilled_subject: fill(subject),
    prefilled_body: fill(body),
    prompt_instruction: instruction,
  },
}];
