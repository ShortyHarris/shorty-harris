alter table ab_metrics drop constraint ab_metrics_prospect_id_fkey,
  add constraint ab_metrics_prospect_id_fkey foreign key (prospect_id) references prospects(id) on delete cascade;