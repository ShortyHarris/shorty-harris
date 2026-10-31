alter table raw_scrapes drop constraint raw_scrapes_campaign_id_fkey;
alter table raw_scrapes add constraint raw_scrapes_campaign_id_fkey
  foreign key (campaign_id) references campaigns(id) on delete cascade;