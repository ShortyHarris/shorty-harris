import { LegalPage, type LegalSection } from '../components/LegalPage';

// Plain-language disclosure of why Shorty Harris requests Gmail access.
// Mirrors section 3 of the Privacy Policy - keep the two in step. A short
// version with a link here stays on the homepage for Google OAuth verification.

const SECTIONS: LegalSection[] = [
  {
    heading: 'Why we ask for Gmail',
    body: [
      'Connecting Gmail is optional. When you do, your outreach emails go out from your real business address instead of a shared one, and we can see when a business replies to them.',
    ],
  },
  {
    heading: 'What we do with it',
    body: [
      {
        type: 'ul',
        items: [
          'Send the outreach emails you have approved, from your own address.',
          'Detect replies to those emails, so follow-ups stop and interested replies reach your dashboard.',
        ],
      },
    ],
  },
  {
    heading: 'What we never do',
    body: [
      {
        type: 'ul',
        items: [
          'Read unrelated mail in your inbox.',
          'Use Gmail data for advertising.',
          'Sell or share Gmail data with anyone.',
        ],
      },
      "Shorty Harris's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
  },
  {
    heading: 'You stay in control',
    body: [
      "You can disconnect Gmail at any time from your dashboard's Settings page, or from your Google Account's third-party access settings. Disconnecting stops all further use of that Gmail account immediately.",
      'Full details are in our Privacy Policy, linked in the footer of every page.',
    ],
  },
];

export function GmailDataUse() {
  return (
    <LegalPage
      title="How we use your Gmail"
      description="Why Shorty Harris asks for Gmail access, what we do with it, and how to disconnect it at any time."
      path="/gmail-data-use"
      lastUpdated="October 25, 2026"
      intro="Plain-language answers about the optional Gmail connection."
      sections={SECTIONS}
    />
  );
}
