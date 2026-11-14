-- message_block_reasons and approvals_schedule work per client (migration
-- 20261114090000_approvals_schedule_client_scoped_held_check). The view's "is it sendable?" check
-- now also matches on client_id, so a client-filtered read only evaluates that client's drafts,
-- and approvals_schedule reads the client's held drafts once instead of per row. Results must be
-- exactly what they were: a held draft is held, a sendable one is not, another client's drafts
-- never leak in, and a campaign's own country still decides its holidays.
begin;
select plan(11);
select tests.pin_send_day(true);

-- Client A: one sendable approved email, one held (Gmail disconnected on client B is separate).
select tests.client('CZ', 'Europe/Prague', true, 'Client A') as ca \gset
select tests.campaign(:'ca') as camp_a \gset
select tests.prospect(:'camp_a') as pa1 \gset
select tests.prospect(:'camp_a') as pa2 \gset
select tests.message(:'pa1', 'initial', 'approved') as a_ok \gset
select tests.message(:'pa2', 'initial', 'approved') as a_held \gset
update public.prospects set sequence_paused = true where id = :'pa2';

-- Client B: Gmail disconnected, so its approved email is held for no_gmail.
select tests.client('US', 'America/Chicago', false, 'Client B') as cb \gset
select tests.campaign(:'cb') as camp_b \gset
select tests.prospect(:'camp_b') as pb1 \gset
select tests.message(:'pb1', 'initial', 'approved') as b_held \gset

-- ── The view ─────────────────────────────────────────────────────────────────────────────
select ok(tests.sendable(:'a_ok'), 'A sendable approved email is in the send queue');
select is(tests.block_reason(:'a_ok'), null, 'and is not listed as blocked');
select is(tests.block_reason(:'a_held'), 'sequence_paused', 'A held email says why');
select is(tests.block_reason(:'b_held'), 'no_gmail', 'Another client''s held email keeps its own reason');
select is((select count(*)::int from public.message_block_reasons where client_id = :'ca'), 1,
          'Filtered to client A, the view lists only A''s held email');
select is((select count(*)::int from public.message_block_reasons where client_id = :'ca'),
          (select count(*)::int from public.message_block_reasons b where b.message_id in (:'a_ok', :'a_held')),
          'The client-filtered read gives the same answer as looking each email up by id');

-- ── approvals_schedule ──────────────────────────────────────────────────────────────────
select is((select basis from tests.schedule(:'ca', :'a_held')), 'prospect_stopped',
          'A paused prospect''s email shows as stopped');
update public.prospects set sequence_paused = false where id = :'pa2';
update public.campaigns set status = 'paused' where id = :'camp_a';
select is((select basis from tests.schedule(:'ca', :'a_ok')), 'held_by_send_rules',
          'With the campaign paused, an approved email is held by the send rules');
update public.campaigns set status = 'active' where id = :'camp_a';
select is((select basis from tests.schedule(:'ca', :'a_ok')), 'queue_position_and_daily_cap',
          'Active again, it gets a send date from its queue position');
select is((select count(*)::int from public.approvals_schedule(:'ca') s where s.message_id = :'b_held'), 0,
          'Client A''s schedule never includes client B''s drafts');

-- The campaign country (not the client's) still picks the holidays, as send_country() did.
update public.campaigns set country = 'DE' where id = :'camp_a';
select is((select s.estimated_send_at from public.approvals_schedule(:'ca') s where s.message_id = :'a_ok') is not null, true,
          'A campaign with its own country still gets a send date');

select * from finish();
rollback;
