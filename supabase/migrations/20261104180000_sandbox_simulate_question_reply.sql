-- Simulate reply: add 'question' (a real person asking something), which WF4 records
-- as intent 'question'; the prospect is marked replied so nothing more is sent, and the
-- reply is left for the client to answer.
--
-- Applied live as 20261104180000 (an in-place edit). The full resulting definition of
-- sandbox_simulate_reply, including the status-rule change applied a minute later, is
-- in 20261104180032_sandbox_replies_match_production_status_rules.sql.
select 1;
