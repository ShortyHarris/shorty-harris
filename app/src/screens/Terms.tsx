import { LegalPage, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. Acceptance of terms',
    body: [
      'These Terms of Service ("Terms") govern access to and use of Shorty Harris (the "Service"). By creating an account or using the Service, you agree to these Terms on behalf of yourself and, if applicable, the business you represent.',
    ],
  },
  {
    heading: '2. Description of service',
    body: [
      'Shorty Harris helps small and family businesses find prospective customers, draft and send outreach messages, and route qualified replies ("Hot Leads") to the business for follow-up. Every outreach message drafted by the Service is subject to review and approval before it is sent.',
    ],
  },
  {
    heading: '3. Accounts',
    body: [
      'You must provide accurate information when creating an account and keep your login credentials secure. You are responsible for all activity that occurs under your account. Notify us immediately of any unauthorized use.',
    ],
  },
  {
    heading: '4. Connecting Gmail',
    body: [
      "Clients may optionally connect their own Gmail account so outreach is sent from their own address. By connecting Gmail, you authorize Shorty Harris to send messages and read replies on your behalf, solely to operate the Service as described in our Privacy Policy.",
      'You may disconnect your Gmail account at any time from Settings. Disconnecting stops all further use of that account by the Service immediately.',
    ],
  },
  {
    heading: '5. Acceptable use',
    body: [
      'You agree not to use the Service to:',
      {
        type: 'ul',
        items: [
          'Send unsolicited messages in violation of applicable anti-spam laws (e.g. CAN-SPAM, CASL) or the recipient\'s do-not-contact preferences.',
          'Send unlawful, deceptive, defamatory, or harassing content.',
          'Attempt to circumvent the message-approval step before sending.',
          'Interfere with or disrupt the integrity or performance of the Service.',
        ],
      },
      'We may suspend or terminate accounts that violate this section.',
    ],
  },
  {
    heading: '6. Payment and credits',
    body: [
      'The Service is billed on a credit basis as described in your dashboard. Payments are processed by Stripe. Credits are added to your account upon successful payment and are consumed as described in the Service. Fees are non-refundable except where required by law or expressly stated otherwise.',
    ],
  },
  {
    heading: '7. Data ownership',
    body: [
      'You retain ownership of your business data and prospect lists uploaded to or generated through the Service. You grant us a limited license to process that data solely to provide the Service to you.',
    ],
  },
  {
    heading: '8. Disclaimers',
    body: [
      'The Service is provided "as is" without warranties of any kind, express or implied. We do not guarantee any particular volume of replies, leads, or business outcomes from outreach conducted through the Service.',
    ],
  },
  {
    heading: '9. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, Shorty Harris will not be liable for indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability for any claim relating to the Service is limited to the amount you paid us in the twelve months preceding the claim.',
    ],
  },
  {
    heading: '10. Termination',
    body: [
      'You may cancel your account at any time. We may suspend or terminate access to the Service for violation of these Terms or for non-payment. Upon termination, your right to use the Service ends, though certain provisions of these Terms survive termination (including Sections 8 and 9).',
    ],
  },
  {
    heading: '11. Changes to these terms',
    body: [
      'We may update these Terms from time to time. Material changes will be reflected by updating the "Last updated" date above. Continued use of the Service after a change constitutes acceptance of the updated Terms.',
    ],
  },
  {
    heading: '12. Contact us',
    body: [
      'Questions about these Terms can be sent to support@shortyharris.com.',
    ],
  },
];

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      description="The terms that govern your use of Shorty Harris, including outreach sent via connected Gmail accounts."
      path="/terms"
      lastUpdated="July 15, 2026"
      intro="These Terms of Service govern your access to and use of Shorty Harris. Please read them carefully."
      sections={SECTIONS}
    />
  );
}
