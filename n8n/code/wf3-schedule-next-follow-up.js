const msg = $('Get Message').item.json;
const prospect = $('Get Prospect For Send').item.json;
const msgType = msg.message_type || 'initial';
// Follow-ups are spaced in BUSINESS days (Mon-Fri) after the previous send:
// 3, then 5, then 7. follow_up_day stays 3 / 7 / 14 because it is only a step
// label (it keys message_type and the AI prompt), not the gap. Public holidays
// are not counted here; WF5 only runs on business days and skips holidays, so a
// due date that lands on one is picked up on the next working day.
// Luxon plus() needs an object: plus(3, 'days') adds 3 MILLISECONDS.
const STEPS = { initial: [3, 3], follow_up_d3: [7, 5], follow_up_d7: [14, 7] };
function addBusinessDays(start, n) {
  let d = start;
  let left = n;
  while (left > 0) {
    d = d.plus({ days: 1 });
    if (d.weekday < 6) left--;
  }
  return d;
}
const step = STEPS[msgType];
if (step) {
  return [{ json: { should_schedule: true, prospect_id: msg.prospect_id, client_id: prospect.client_id, follow_up_day: step[0], due_at: addBusinessDays($now, step[1]).toISO() } }];
}
return [{ json: { should_schedule: false } }];
