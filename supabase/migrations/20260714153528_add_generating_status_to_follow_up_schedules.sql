
alter table follow_up_schedules drop constraint follow_up_schedules_status_check;
alter table follow_up_schedules add constraint follow_up_schedules_status_check
  check (status = any (array['pending'::text, 'generating'::text, 'generated'::text, 'sent'::text, 'cancelled'::text, 'rescheduled'::text]));
