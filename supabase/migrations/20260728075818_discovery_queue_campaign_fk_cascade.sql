alter table discovery_queue drop constraint discovery_queue_campaign_id_fkey,
  add constraint discovery_queue_campaign_id_fkey foreign key (campaign_id) references campaigns(id) on delete cascade;