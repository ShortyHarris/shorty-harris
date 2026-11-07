-- Unsubscribe handling: an opt-out (unsubscribe link, opt-out reply, admin entry) blocks every
-- queued and future email to that address, for every client; our own footer quoted back in a
-- reply is not an opt-out.
begin;
select plan(21);

select tests.client() as client_id \gset
select tests.campaign(:'client_id') as campaign_id \gset
select tests.client('US', 'America/New_York', true, 'Other Client') as other_client \gset
select tests.campaign(:'other_client') as other_campaign \gset

-- A prospect mid-sequence: first email sent 20 days ago, follow-up 1 written and approved.
select tests.prospect(:'campaign_id', 'Sam@Shared-Prospect.example') as prospect_id \gset
select tests.message(:'prospect_id', 'initial', 'approved') as initial \gset
select tests.sent(:'initial', now() - interval '20 days');
select tests.schedule_next(:'initial');
select tests.message(:'prospect_id', 'follow_up_d3', 'approved') as fu1 \gset
select ok(tests.sendable(:'fu1'), 'Before the opt-out, the due follow-up is in the send queue');

-- The same person is also a prospect of another client (a client holds one prospect per
-- address): first email sent 2 days ago, follow-up 1 scheduled but not written yet.
select tests.prospect(:'other_campaign', 'SAM@shared-prospect.example') as same_person \gset
select tests.message(:'same_person', 'initial', 'approved') as same_person_initial \gset
select tests.sent(:'same_person_initial', now() - interval '2 days');
select tests.schedule_next(:'same_person_initial') as same_person_schedule \gset

-- The prospect clicks the unsubscribe link (public page, no login).
select unsubscribe_token as token from public.prospects where id = :'prospect_id' \gset
select tests.claims_anon();
set local session authorization anon;
select is(public.unsubscribe_by_token(:'token')->>'ok', 'true', 'The unsubscribe link works without logging in');
select is(public.unsubscribe_by_token(gen_random_uuid())->>'reason', 'invalid_token',
          'An unknown token is refused without revealing anything');
reset session authorization;
select tests.claims_none();

select is((select reason from public.do_not_contact where email = 'sam@shared-prospect.example'), 'opt_out',
          'The address is on the do-not-contact list, lower-cased');
select is((select pipeline_status from public.prospects where id = :'prospect_id'), 'lost', 'The prospect is closed as lost');
select ok(not tests.sendable(:'fu1'), 'The approved follow-up never sends');
select is((select count(*)::int from public.messages where prospect_id = :'prospect_id' and send_status = 'not_sent' and approval_status <> 'rejected'),
          0, 'No unsent email for the prospect is left pending or approved');
select is((select status from public.follow_up_schedules where id = :'same_person_schedule'), 'cancelled',
          'The other client''s scheduled follow-up to the same address is cancelled (case-insensitive match)');
select ok((select followups_stopped from public.prospects where id = :'same_person'), 'and follow-ups are stopped for that prospect');
select is((select count(*)::int from public.sequence_writer_queue where prospect_id in (:'prospect_id', :'same_person')),
          0, 'Nothing further is queued to be written for that address');

-- Even if someone resets the email to approved / not sent by hand, the send gate still holds it.
update public.messages set send_status = 'not_sent', approval_status = 'approved', reject_reason = null where id = :'fu1';
select ok(not tests.sendable(:'fu1'), 'An email reset by hand to approved / not sent is still held');

-- The address is found later by a third client: it is suppressed on arrival.
select tests.client('CZ', 'Europe/Prague', true, 'Third Client') as third_client \gset
select tests.campaign(:'third_client') as later_campaign \gset
select tests.prospect(:'later_campaign', 'sam@shared-prospect.example') as found_again \gset
select ok((select followups_stopped from public.prospects where id = :'found_again'), 'A newly found prospect with an opted-out address is suppressed on arrival');
select tests.message(:'found_again', 'initial', 'approved') as found_again_email \gset
select ok(not tests.sendable(:'found_again_email'), 'and their first email never sends, even if approved');
select is(tests.block_reason(:'found_again_email'), 'do_not_contact', 'Approvals says why: do not contact');

-- An admin adds an address by hand.
select tests.prospect(:'campaign_id') as manual_prospect \gset
select tests.message(:'manual_prospect', 'initial', 'approved') as manual_email \gset
select ok(tests.sendable(:'manual_email'), 'An approved first email is queued...');
insert into public.do_not_contact (email, reason) select upper(email), 'manual' from public.prospects where id = :'manual_prospect';
select ok(not tests.sendable(:'manual_email'), '...until an admin adds the address to do-not-contact (any letter case)');

-- Opt-out by reply.
select tests.prospect(:'campaign_id') as replier \gset
select tests.message(:'replier', 'initial', 'approved') as replier_initial \gset
select tests.sent(:'replier_initial', now() - interval '4 days');
select tests.schedule_next(:'replier_initial');
select tests.message(:'replier', 'follow_up_d3', 'approved') as replier_fu1 \gset
insert into public.replies (prospect_id, client_id, message_id, body)
values (:'replier', :'client_id', :'replier_initial', E'Please remove me from your list.\n\nOn Mon, Dana wrote:\n> Hi');
select is((select reason from public.do_not_contact where email = (select lower(email) from public.prospects where id = :'replier')),
          'opt_out', 'A reply asking to be removed puts the address on the do-not-contact list');
select ok(not tests.sendable(:'replier_fu1'), 'and the approved follow-up never sends');

-- Our own footer quoted back is not an opt-out.
select ok(not public.reply_has_optout(E'Sounds interesting, tell me more.\n\nTo stop receiving these emails, reply "unsubscribe" to this email.'),
          'A reply that only quotes our footer ("reply unsubscribe") is not an opt-out');
select ok(not public.reply_has_optout(E'Yes, call me Tuesday.\n\nUnsubscribe here: https://example.test/unsubscribe/abc'),
          'Nor is our footer''s unsubscribe link line');
select ok(public.reply_has_optout('Odhlaste mě prosím.'), 'A Czech opt-out ("odhlaste") is recognised');

select * from finish();
rollback;
