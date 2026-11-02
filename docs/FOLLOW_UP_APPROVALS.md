# Follow-up approvals: when follow-ups appear, and Pending vs Blocked

For Marcus and Martin. How a follow-up gets into the Approvals queue, how a client can start approving follow-ups early, and what each Approvals tab means.

## The sequence

Every prospect gets up to four emails:

| Step | Name in the app | Earliest send |
|---|---|---|
| `initial` | First Touch | As soon as it is approved and the daily cap allows |
| `follow_up_d3` | Follow-Up 1 | 3 business days after the First Touch was **sent** |
| `follow_up_d7` | Follow-Up 2 | 5 business days after Follow-Up 1 was **sent** |
| `follow_up_d14` | Follow-Up 3 | 7 business days after Follow-Up 2 was **sent** |

Business days skip weekends and the campaign country's public holidays, in the client's send time zone.
A reply, a hot lead, a bounce, an unsubscribe, or **Stop follow-ups** ends the sequence. Any unsent follow-ups for that prospect are cancelled.

## When follow-up drafts are written

Each campaign has a **Write follow-ups now** switch, `campaigns.upfront_sequence`. The main control is the bar at the top of the **Approvals** page, above the tabs, which switches every live campaign at once. Each campaign can also be switched on its own: clients use the campaign's details in Campaigns, and admins use the admin campaign editor.

**Off (the default).** Each follow-up is drafted by WF5 when it falls due: after the previous email has been sent and the business-day gap has passed. Until then there is nothing to approve.
With a slow warm-up this can leave Pending empty for days. For example, PostKing has 231 approved first emails going out 5 a day, so most of its follow-ups don't exist yet.

**On.** WF19 drafts all three follow-ups as soon as a prospect has a first-email draft, at about 120 drafts an hour. The client can then review and approve the whole sequence at once, and **Approve all pending** approves every step.

Turning it on **never sends anything earlier**. Sending (`sendable_messages`) still requires the previous email to have been sent plus the business-day gap. An approved follow-up that is waiting shows on the **Approved** tab as *Scheduled*, not Blocked.

There are no duplicates: the database allows one live draft per step per prospect (`messages_one_followup_per_step`). If a follow-up was already drafted early, WF5 skips it when it falls due.

Turning it off stops new early drafts. Drafts already written stay in Approvals.

Cost: three Gemini drafts per prospect, written up front. Some of these won't be needed if the prospect replies to the first email; those drafts are cancelled automatically.

## The Approvals tabs

| Tab | What is in it | Who acts |
|---|---|---|
| **Pending** | Drafts waiting for the client's approval: first emails, and follow-ups once they exist | Client approves, edits or rejects |
| **Approved** | Approved and not sent yet: *Sendable* (goes out within the daily cap) or *Scheduled* (a follow-up waiting for its send date) | Nobody. They send on their own |
| **Blocked** | Approved but held back for a reason that must be cleared first | Fix the reason, or reject the draft |

The top of the **Approvals** page, above the tabs, always shows a follow-ups bar while a campaign is live, whichever tab is open. This is the main place to switch it:
- **Off:** it explains when follow-ups normally appear (and, if none are pending yet, how many first emails are still queued). The **Write follow-ups now** button turns it on for every live campaign.
- **On for some campaigns:** it says how many, and the button reads **Turn on for all**.
- **On:** it says follow-ups are being drafted up front, and the button reads **Turn off**.

The Blocked tab lists how many drafts are held for each reason, using the same words as the row badges:

| Reason | Meaning |
|---|---|
| Shared address | info@ / office@ in an EU or Czech campaign (`generic_mailbox`). Admin can allow per client |
| Personal address | Gmail, Seznam etc. in an EU or Czech campaign (`freemail_address`) |
| Country hold | Sending to that country is paused (`country_hold`) |
| Opted out | On the do-not-contact list (`do_not_contact`) |
| Follow-ups stopped / prospect replied | The sequence for that prospect has ended |
| Campaign not live / paused | The campaign isn't active |

Drafts held by the shared-address and personal-address rules are **hidden from the client**: they don't appear on any tab or in any count. Only admins see them.
For example, TUTEL currently has 99 approved first emails to shared addresses. An admin sees them as Blocked; the client sees nothing for them.

## Quick answers

- **"Pending is empty but I expected follow-ups."** The first emails haven't been sent yet, so their follow-ups don't exist. Use **Write follow-ups now**, or wait for the first emails to send.
- **"I approved follow-ups. Why haven't they sent?"** They are Scheduled: each waits for the email before it to send, plus 3, 5 or 7 business days.
- **"Why are drafts Blocked?"** Open the Blocked tab. The list at the top gives the count for each reason, and each row has a badge.
