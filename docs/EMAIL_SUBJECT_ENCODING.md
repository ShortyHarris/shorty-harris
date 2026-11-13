# Email subject encoding (Czech and other non-ASCII subjects)

## The bug

Czech subjects reached Gmail double-mangled, for example
"Realizace vašich interiérů v Praze" showed as "Realizace vaÃ…Â¡ich interiÃƒÂ©rÃ…Â¯ v Praze".
Follow-ups in the same thread showed the same broken subject. The body was fine.

`š` is the bytes `C5 A1`. Read as Windows-1252 they become `Å¡`, and doing the same again gives
`Ã…Â¡`. So the subject was turned into bytes and back into text twice, then written into the
`Subject:` header as raw 8-bit bytes rather than as an RFC 2047 encoded word.

## Where it is (and is not)

| Stage | Status |
| --- | --- |
| WF2 (first email) and WF19 (follow-ups) write `messages.subject` | Clean. Plain JS strings, no byte handling. |
| WF3 sends `subject: messages.subject` to `gmail-client` as JSON | Clean. |
| `gmail-client` edge function builds the MIME message | **The bug is here.** The Subject header is not RFC 2047 encoded, and a threaded follow-up reuses the thread's (broken) subject instead of the stored one. |

`gmail-client` is deployed on the production Supabase project but its source is not in this
repository, so the fix below has to be applied there.

## The fix: `supabase/functions/_shared/emailSubject.ts`

Tested in `app/src/lib/emailSubject.test.ts` (š é ů ý á ř č, the exact strings from the report,
one initial email and two follow-ups end to end).

- `encodeSubjectHeader(subject)`: ASCII unchanged, otherwise `=?UTF-8?B?...?=` words of at most
  75 characters, never splitting a character, folded with CRLF + space. Strips CR/LF.
- `threadFollowUpSubject({ threadOriginalSubject, templateSubject, gmailThreadSubject, ownSubject })`:
  `Re: <clean original>`. It trusts the stored subject of the thread's first email over anything
  read back from Gmail, and repairs mojibake if that is all it has.
- `repairMojibake(text)`: undoes 1 to 3 levels of this corruption. Correct text is returned unchanged.

### Changes to make in `gmail-client` (action `send`)

```ts
import { cleanSubject, encodeSubjectHeader, threadFollowUpSubject } from '../_shared/emailSubject.ts';

// 1. Pick the subject. For an email going into an existing thread, use the clean stored
//    subject of the prospect's first sent email, never the Subject header fetched from Gmail.
let subject = cleanSubject(body.subject);
if (threadId) {
  const { data: first } = await admin
    .from('messages')
    .select('subject')
    .eq('prospect_id', message.prospect_id)
    .eq('message_type', 'initial')
    .eq('send_status', 'sent')
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  subject = threadFollowUpSubject({
    threadOriginalSubject: first?.subject,
    gmailThreadSubject: subjectReadFromGmailThread, // whatever is used today, if anything
    ownSubject: body.subject,
  });
}

// 2. Encode once, here, and nowhere else.
headers.push(`Subject: ${encodeSubjectHeader(subject)}`);
```

Also remove from the subject path any of these, if present: `unescape(encodeURIComponent(...))`,
`Buffer.from(..., 'latin1' | 'binary')`, `TextDecoder('latin1')`, or a second encoding of an
already encoded value. The whole raw MIME message should be turned into bytes once with
`TextEncoder` and then base64url-encoded for the Gmail API `raw` field. Keep `threadId`,
`In-Reply-To` and `References` as they are, so threading still works.

## Existing threads that already have a broken subject

Recommended: future follow-ups use the clean subject (`Re: <stored original subject>`), repaired
from the template or from Gmail if the stored one is missing.

Trade-off: the Gmail API only adds a message to a thread when the subjects match. For threads
whose first email went out broken, a follow-up with the clean subject will usually appear as a new
conversation for the recipient, not under the broken one. A readable subject in a cold email
matters more than keeping the thread together. Threads started after the fix are not affected.

The alternative is to keep sending the old broken subject into those threads only, which keeps
them together but sends the recipient more mojibake.

## Acceptance test

Sandbox client, a campaign with Czech subjects (for example "Realizace vašich interiérů v Praze",
"Spolehlivý dodavatel"). Send the first email and both follow-ups (sandbox time travel,
`docs/SANDBOX.md`). In Gmail web and the Gmail mobile app, all three show the correct subject
(follow-ups as `Re: …`) in one conversation. "Show original" shows `Subject: =?UTF-8?B?...?=`.
