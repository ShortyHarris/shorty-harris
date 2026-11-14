# Email subject encoding (Czech and other non-ASCII subjects)

## What was reported

Czech subjects showed as mojibake in Gmail, for example "Realizace vašich interiérů v Praze" as
"Realizace vaÃ…Â¡ich interiÃƒÂ©rÃ…Â¯ v Praze". Follow-ups in the same thread showed the same broken
subject. The body was fine.

## What was actually wrong (checked against production, 13 Nov 2026)

- **Stored subjects are clean.** No row in `messages` contains mojibake. WF2 (first email) and WF19
  (follow-ups) write plain Unicode, and WF3 passes it unchanged to `gmail-client`.
- **`gmail-client` has encoded subjects correctly since 25 Oct 2026, 08:38 UTC** (version 12). Its
  `encodeHeader` writes RFC 2047 `=?UTF-8?B?...?=` words, and threaded follow-ups use
  `Re: <stored subject of the first email>` from the database, never a header read back from Gmail.
- **Every broken thread started before that fix.** 75 Czech first emails went out between 22 and
  24 Oct with the old, broken header. All the examples in the report ("Terronská 871", "Rekonstrukce
  bytů pro vaše klienty", "Realizace vašich interiérů", "Spolehlivý dodavatel") were sent on 22 or 23 Oct.
- **Why the follow-ups look broken too.** They are sent with a correct `Re: …` subject into the same
  Gmail thread. Gmail's inbox list titles a conversation by its first message, so in the sender's
  mailbox the whole thread keeps the old broken title. Opening the thread shows the follow-ups with
  the correct subject.

## Source and tests

- `supabase/functions/gmail-client/index.ts`: the deployed source (version 12), now in the repo.
- `app/src/n8n/gmail-client-subject.test.ts`: lifts `encodeHeader` and the follow-up subject rule
  out of that file and checks š é ů ý á ř č, the reported subjects, 75-character word limits,
  header injection, and a first email plus two follow-ups.

## Existing broken threads

A message that has already been delivered cannot be changed, so those first emails stay broken in
the recipient's and the sender's mailbox. Follow-ups to them already go out with the clean
`Re: <subject>` taken from the database, so no data repair is needed: the stored subject is the clean
template subject. 38 follow-ups for these threads are still pending or approved.

## Verified end to end (13 Nov 2026)

Sandbox client "Sandbox (Marcus Chongwani)", campaign language Czech, one prospect. The first email's
subject was set to "Realizace vašich interiérů v Praze – příliš žluťoučký kůň (š é ů ý á ř č)", then
the first email and both follow-ups were sent through the real WF2 > WF3 > WF5 path with sandbox time
travel. Reading the mailbox back through `gmail-client` (`read_replies`, which returns the Subject as
Gmail decoded it) gave one thread (`1a1d5e1c8146d300`) with:

- first email: `Realizace vašich interiérů v Praze – příliš žluťoučký kůň (š é ů ý á ř č)`
- follow-up 1: `Re: Realizace vašich interiérů v Praze – příliš žluťoučký kůň (š é ů ý á ř č)`
- follow-up 2: `Re: Realizace vašich interiérů v Praze – příliš žluťoučký kůň (š é ů ý á ř č)`

Still to look at by eye: the same thread in the Gmail web and mobile apps.

## Acceptance test

Sandbox client, a campaign with Czech subjects (for example "Realizace vašich interiérů v Praze",
"Spolehlivý dodavatel"). Send the first email and both follow-ups (sandbox time travel,
`docs/SANDBOX.md`). In Gmail web and the Gmail mobile app, all three show the correct subject
(follow-ups as `Re: …`) in one conversation. "Show original" shows `Subject: =?UTF-8?B?...?=`.
