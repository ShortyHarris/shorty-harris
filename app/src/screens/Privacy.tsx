import { LegalPage, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. Who we are',
    body: [
      'Shorty Harris ("Shorty Harris", "we", "us") provides AI-powered outbound prospecting software for small and family businesses ("Service"). This policy explains what information we collect through the Service, how we use it, and the choices you have.',
      'This policy applies to visitors of our website, and to the business owners and team members ("Clients") who use our dashboard.',
    ],
  },
  {
    heading: '2. Information we collect',
    body: [
      'Account information: name, business name, email address, phone number, and login credentials.',
      'Prospect data: publicly available business information (business name, category, location, contact details) that our Service gathers on a Client\'s behalf in order to run outreach campaigns.',
      'Outreach content: the messages our Service drafts and sends, and any replies received, so that Clients can review, approve, and act on them.',
      'Payment information: processed directly by Stripe, our payment processor. We do not store full card numbers on our own servers.',
      'Usage data: pages visited and general interaction data via Google Analytics, used to understand and improve the Service.',
    ],
  },
  {
    heading: '3. Google user data (Gmail)',
    body: [
      'Clients may optionally connect their own Gmail account so outreach emails are sent from their own address instead of a shared one. When a Client connects Gmail, we request limited permission to send emails on their behalf and to read incoming replies to those emails, strictly in order to operate the Service the Client has asked for.',
      "Shorty Harris's use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
      'We do not use Gmail data for advertising, and we do not sell Gmail data to third parties. Gmail access is used only to send the Client\'s own outreach messages and to detect replies to those messages.',
      'A Client can revoke Gmail access at any time from the Settings page in their dashboard, or directly from their Google Account\'s third-party access settings. Revoking access stops all further use of that Gmail account immediately.',
    ],
  },
  {
    heading: '4. How we use information',
    body: [
      {
        type: 'ul',
        items: [
          'To operate the Service — finding prospects, drafting outreach, and routing replies for review.',
          'To send emails or messages on a Client\'s behalf, using the Client\'s own connected Gmail account where applicable.',
          'To process payments and manage billing.',
          'To provide customer support and respond to inquiries.',
          'To monitor, secure, and improve the Service.',
        ],
      },
    ],
  },
  {
    heading: '5. How we share information',
    body: [
      'We do not sell personal information. We share information only with service providers who help us operate the Service, under agreements that limit their use of the data to providing that service:',
      {
        type: 'ul',
        items: [
          'Supabase — database hosting and authentication.',
          'Google — Gmail API, for Clients who choose to connect Gmail.',
          'Stripe — payment processing.',
          'Our workflow automation infrastructure — for scheduling and sending outreach.',
          'Google Analytics — anonymized usage analytics.',
        ],
      },
      'We may also disclose information if required by law, or to protect the rights, property, or safety of Shorty Harris, our Clients, or others.',
    ],
  },
  {
    heading: '6. Data retention',
    body: [
      'We retain account and campaign data for as long as an account is active, and for a reasonable period afterward to comply with legal, accounting, or reporting obligations. Clients may request deletion of their account and associated data at any time by contacting us.',
    ],
  },
  {
    heading: '7. Your rights and choices',
    body: [
      {
        type: 'ul',
        items: [
          'Access or update your account information at any time from your dashboard.',
          'Disconnect your Gmail account at any time from Settings.',
          'Request a copy of, or deletion of, your data by contacting us.',
          'Unsubscribe from marketing emails using the link in any such email.',
        ],
      },
    ],
  },
  {
    heading: '8. Security',
    body: [
      'We use reasonable technical and organizational measures — including encryption in transit, access controls, and row-level data isolation between Clients — to protect information against unauthorized access, alteration, or loss. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
    ],
  },
  {
    heading: '9. Children\'s privacy',
    body: [
      'The Service is intended for business use and is not directed at children under 16. We do not knowingly collect personal information from children.',
    ],
  },
  {
    heading: '10. Changes to this policy',
    body: [
      'We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above. Continued use of the Service after a change constitutes acceptance of the updated policy.',
    ],
  },
  {
    heading: '11. Contact us',
    body: [
      'Questions about this policy or your data can be sent to privacy@shortyharris.com.',
    ],
  },
];

export function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How Shorty Harris collects, uses, and protects your information, including data accessed via Google APIs."
      path="/privacy"
      lastUpdated="July 15, 2026"
      intro="This policy describes how Shorty Harris collects, uses, and shares information when you visit our website or use our dashboard."
      sections={SECTIONS}
    />
  );
}
