alter table campaigns drop constraint campaigns_created_by_fkey,
  add constraint campaigns_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table messages drop constraint messages_approved_by_fkey,
  add constraint messages_approved_by_fkey foreign key (approved_by) references profiles(id) on delete set null;

alter table ab_tests drop constraint ab_tests_created_by_fkey,
  add constraint ab_tests_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table error_logs drop constraint error_logs_resolved_by_fkey,
  add constraint error_logs_resolved_by_fkey foreign key (resolved_by) references profiles(id) on delete set null;