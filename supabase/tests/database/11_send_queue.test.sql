-- The send queue: approved emails that have not gone out yet can be listed, edited (staying
-- approved), moved back to Pending or cancelled, until the sender claims them. The claim only
-- takes an email that is still approved and hands back the copy as it is at that moment, which
-- is what WF3 sends.
begin;
select plan(47);
select tests.pin_send_day(true);

select tests.client() as client_id \gset
select tests.user(:'client_id') as user_id \gset
select tests.campaign(:'client_id') as campaign_id \gset
select tests.campaign(:'client_id') as campaign2_id \gset
select tests.client(p_name => 'Other Client') as other_client \gset
select tests.user(:'other_client') as other_user \gset
select tests.user(null, 'admin') as admin_id \gset

select tests.prospect(:'campaign_id') as p1 \gset
select tests.prospect(:'campaign_id') as p2 \gset
select tests.prospect(:'campaign_id') as p3 \gset
select tests.prospect(:'campaign2_id') as p4 \gset
select tests.prospect(:'campaign_id') as p5 \gset
select tests.message(:'p1', 'initial', 'approved') as m1 \gset
select tests.message(:'p2', 'initial', 'approved') as m2 \gset
select tests.message(:'p3', 'initial', 'approved') as m3 \gset
select tests.message(:'p4', 'initial', 'approved') as m4 \gset
select tests.message(:'p5', 'initial', 'pending') as pending_msg \gset
select tests.campaign(:'other_client') as other_campaign \gset
select tests.prospect(:'other_campaign') as op1 \gset
select tests.message(:'op1', 'initial', 'approved') as other_msg \gset

select ok(tests.sendable(:'m1'), 'Fixture: an approved first email is in the send queue');

-- ── The list ─────────────────────────────────────────────────────────────────────────────
select tests.claims_client(:'user_id');
set local session authorization authenticated;
select public.send_queue(:'client_id') as q \gset
reset session authorization;
select ok((:'q'::jsonb ->> 'ok')::boolean, 'A client can open their own send queue');
select is((:'q'::jsonb ->> 'total')::int, 4, 'It lists every approved, unsent email (not pending drafts)');
select is((select count(*)::int from jsonb_array_elements(:'q'::jsonb -> 'rows') r where r ->> 'estimated_send_at' is not null),
          4, 'Each queued email shows when it is scheduled to go out');
select is((:'q'::jsonb #>> '{windows,all}')::int,
          (:'q'::jsonb #>> '{windows,today}')::int + (:'q'::jsonb #>> '{windows,tomorrow}')::int
            + (:'q'::jsonb #>> '{windows,later}')::int + (:'q'::jsonb #>> '{windows,unscheduled}')::int,
          'The send windows (today / tomorrow / later / not scheduled) add up to the whole queue');
select is(jsonb_array_length(:'q'::jsonb -> 'campaigns'), 2, 'The campaigns holding queued emails are listed for the filter');

select tests.claims_client(:'user_id');
set local session authorization authenticated;
select is((public.send_queue(:'client_id', :'campaign2_id') ->> 'total')::int, 1, 'Filtering by campaign narrows the list');
select is((public.send_queue(:'client_id', p_message_type => 'follow_up_d3') ->> 'total')::int, 0, 'Filtering by email type narrows the list');
select is(public.send_queue(:'client_id', p_window => 'soon') ->> 'error', 'bad_window', 'An unknown send window is refused');
select is(public.send_queue(:'other_client') ->> 'error', 'not_permitted', 'A client cannot open another client''s queue');
select is(public.send_queue(null) ->> 'error', 'not_permitted', 'Only an admin can list every client at once');
reset session authorization;

select tests.claims_client(:'admin_id');
set local session authorization authenticated;
select public.send_queue(null) as aq \gset
select is((public.send_queue(null, p_window => 'all') -> 'rows' -> 0 ->> 'client_name') is not null, true, 'Admin rows carry the client name');
reset session authorization;
select ok((select count(*) from jsonb_array_elements(:'aq'::jsonb -> 'clients') c
            where c ->> 'id' in (:'client_id', :'other_client')) = 2, 'An admin sees every client''s queue, with a client filter');

-- ── Edit without un-approving ────────────────────────────────────────────────────────────
select tests.claims_client(:'user_id');
set local session authorization authenticated;
select public.edit_queued_message(:'m1', 'Správa domu pro SVJ', E'Dobrý den,\n\nnová verze.\n\nDana') as e1 \gset
select is(public.edit_queued_message(:'m1', null, '   ') ->> 'error', 'empty_body', 'An empty body is refused');
select is(public.edit_queued_message(:'other_msg', 'x', 'y') ->> 'error', 'not_permitted', 'A client cannot edit another client''s email');
select is(public.edit_queued_message(:'pending_msg', 'x', 'y') ->> 'error', 'not_queued', 'A pending draft is not edited through the send queue');
reset session authorization;
select ok((:'e1'::jsonb ->> 'ok')::boolean, 'The client can edit an approved email waiting to send');
select is((select approval_status from public.messages where id = :'m1'), 'approved', 'The edit keeps it approved');
select is((select subject from public.messages where id = :'m1'), 'Správa domu pro SVJ', 'The new subject is saved');
select isnt((select queue_edited_at from public.messages where id = :'m1'), null, 'The edit is recorded (queue_edited_at)');
select is((select queue_edited_by from public.messages where id = :'m1'), :'user_id'::uuid, 'And who made it');
select ok(tests.sendable(:'m1'), 'After the edit it is still in the send queue');

-- View as client (an impersonation token) can look but not change anything.
select tests._claims('authenticated', :'admin_id', jsonb_build_object('impersonating', true, 'client_id', :'client_id'));
set local session authorization authenticated;
select ok((public.send_queue(:'client_id') ->> 'ok')::boolean, 'View-as-client can read the queue');
select is(public.edit_queued_message(:'m2', 'x', 'y') ->> 'error', 'not_permitted', 'View-as-client cannot edit');
select is(public.cancel_queued_messages(array[:'m2']::uuid[]) #>> '{skipped,not_permitted}', '1', 'View-as-client cannot cancel');
reset session authorization;

-- ── Back to pending, and cancel ──────────────────────────────────────────────────────────
select tests.claims_client(:'user_id');
set local session authorization authenticated;
select public.unapprove_queued_messages(array[:'m2']::uuid[]) as u \gset
select public.cancel_queued_messages(array[:'m3', :'other_msg']::uuid[]) as c \gset
reset session authorization;
select is((:'u'::jsonb ->> 'done')::int, 1, 'Move back to pending reports what it changed');
select is((select approval_status from public.messages where id = :'m2'), 'pending', 'The email is a pending draft again');
select is((select approved_at from public.messages where id = :'m2'), null, 'Its approval is cleared');
select ok(not tests.sendable(:'m2'), 'A draft moved back to pending does not send');
select is((:'c'::jsonb ->> 'done')::int, 1, 'Cancel changes only the emails this user may change...');
select is(:'c'::jsonb #>> '{skipped,not_permitted}', '1', '...and says why the rest were skipped');
select is((select approval_status || '/' || reject_reason from public.messages where id = :'m3'), 'rejected/manual', 'A cancelled email is rejected by a person');
select is((select rejected_by from public.messages where id = :'m3'), :'user_id'::uuid, 'The person who cancelled it is recorded');
select ok(not tests.sendable(:'m3'), 'A cancelled email does not send');

-- ── The sender's claim ───────────────────────────────────────────────────────────────────
select tests.claims_service();
set local session authorization service_role;
select public.claim_message_for_send(:'m1') as claim \gset
select is((public.claim_message_for_send(:'m2') ->> 'claimed')::boolean, false, 'The sender cannot claim an email that was moved back to pending');
reset session authorization;
select is(:'claim'::jsonb ->> 'subject', 'Správa domu pro SVJ', 'The claim hands WF3 the edited copy, so the edit is what goes out');

select tests.claims_client(:'user_id');
set local session authorization authenticated;
select is(public.edit_queued_message(:'m1', 'too late', null) ->> 'error', 'sending', 'Once claimed for sending, the email can no longer be edited');
select is(public.unapprove_queued_messages(array[:'m1']::uuid[]) #>> '{skipped,sending}', '1', '...or pulled back');
reset session authorization;


-- ── A follow-up that is already due ─────────────────────────────────────────────────────
-- Its first email went out 30 days ago, so its estimate is in the past. The queue shows the
-- sender's next real slot instead (never a time that has gone by).
select tests.prospect(:'campaign_id') as p_due \gset
select tests.message(:'p_due', 'initial', 'approved') as due_initial \gset
select tests.sent(:'due_initial', now() - interval '30 days');
select tests.message(:'p_due', 'follow_up_d3', 'approved') as due_fu \gset
select ok((select estimated_send_at from tests.schedule(:'client_id', :'due_fu')) < now(), 'Fixture: the follow-up''s schedule estimate is in the past');
select tests.claims_client(:'user_id');
set local session authorization authenticated;
select r as due_row from jsonb_array_elements(public.send_queue(:'client_id', p_limit => 200) -> 'rows') r where r ->> 'id' = :'due_fu' \gset
reset session authorization;
select is((:'due_row'::jsonb ->> 'due')::boolean, true, 'The queue marks it as due');
select ok((:'due_row'::jsonb ->> 'estimated_send_at')::timestamptz >= now() - interval '1 minute', 'It shows the next send slot, not a time already gone');

-- ── A daily cap: more approved emails than one day's sending ────────────────────────────
-- 41 approved first emails on a 40-a-day mailbox: some wait for a later day, and one due
-- today can still be edited or cancelled before it is sent.
select tests.client(p_name => 'Capped Client') as cap_client \gset
select tests.user(:'cap_client') as cap_user \gset
select tests.campaign(:'cap_client') as cap_campaign \gset
select count(tests.message(tests.prospect(:'cap_campaign'), 'initial', 'approved')) from generate_series(1, 41);
select tests.claims_client(:'cap_user');
set local session authorization authenticated;
select public.send_queue(:'cap_client', p_window => 'today', p_limit => 1) as capq \gset
reset session authorization;
select is((select mailbox_daily_cap from public.mailbox_daily_cap(:'cap_client')), 40, 'Fixture: the mailbox sends 40 a day');
select ok((:'capq'::jsonb #>> '{windows,tomorrow}')::int + (:'capq'::jsonb #>> '{windows,later}')::int >= 1,
          'Emails past the daily cap are scheduled for a later day, and the queue says so');
select (:'capq'::jsonb -> 'rows' -> 0 ->> 'id') as first_today \gset
select (select id from public.messages where client_id = :'cap_client' and id <> :'first_today' order by created_at, id limit 1) as second_today \gset
select tests.claims_client(:'cap_user');
set local session authorization authenticated;
select public.cancel_queued_messages(array[:'first_today']::uuid[]) ->> 'done' as cap_cancel \gset
select public.edit_queued_message(:'second_today', 'Opraveno', null) ->> 'ok' as cap_edit \gset
reset session authorization;
select is(:'cap_cancel'::text, '1', 'An email in today''s cap window can be cancelled before it is sent');
select ok(not tests.sendable(:'first_today'), '...and the sender no longer picks it up');
select tests.claims_service();
set local session authorization service_role;
select is(public.claim_message_for_send(:'second_today') ->> 'subject', 'Opraveno', 'An email edited inside today''s window is sent with the edit');
reset session authorization;

select tests.claims_anon();
set local session authorization anon;
select throws_ok($$select public.send_queue(null)$$, '42501', null, 'The public key cannot read the send queue');
reset session authorization;

select * from finish();
rollback;
