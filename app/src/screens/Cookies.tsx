import { LegalPage, type LegalSection } from '../components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. What this policy covers',
    body: [
      'This policy explains the cookies and similar tracking technologies (like local storage) used on the Shorty Harris website and dashboard, why we use them, and how you can control them. It should be read alongside our Privacy Policy.',
      'You can change your cookie choices at any time using the "Cookie settings" link in the footer of any page.',
    ],
  },
  {
    heading: '2. Categories of cookies we use',
    body: [
      {
        type: 'ul',
        items: [
          'Necessary: required for the site and dashboard to function, including keeping you signed in, remembering your cookie choice, and basic security. These cannot be switched off and are not used for tracking.',
          'Analytics: Google Analytics (site-wide) and, for signed-in Clients only, Smartlook session recording, used to understand how the Service is used so we can improve it. These are only set if you opt in.',
        ],
      },
      'We do not use advertising or cross-site marketing cookies.',
    ],
  },
  {
    heading: '3. Your choice, and how consent works here',
    body: [
      'On your first visit, a banner asks you to accept all cookies, reject non-essential cookies, or choose your preferences. Analytics cookies are only set after you actively opt in, so nothing non-essential loads before that.',
      'You can withdraw or change consent at any time via "Cookie settings" in the footer. Withdrawing consent stops future analytics collection; it does not delete data already collected, which is handled under the retention terms in our Privacy Policy.',
    ],
  },
  {
    heading: '4. Legal basis by region',
    body: [
      {
        type: 'ul',
        items: [
          'European Union / EEA and UK: under the ePrivacy Directive and GDPR, we ask for your opt-in consent before setting any non-essential cookie, and you can withdraw that consent as easily as you gave it.',
          'Zambia: under the Data Protection Act No. 3 of 2021, we rely on your consent as the legal basis for analytics cookies and process the resulting data only for the purpose you consented to.',
          'United States: state privacy laws (e.g. California\'s CCPA/CPRA) give you the right to opt out of the "sale" or "sharing" of personal information. We do not sell personal information, and our analytics tools are configured for internal product-improvement use only; rejecting analytics cookies in the banner opts you out of this data collection entirely.',
        ],
      },
    ],
  },
  {
    heading: '5. Third-party cookies',
    body: [
      {
        type: 'ul',
        items: [
          'Google Analytics (Google LLC): usage analytics. See Google\'s privacy policy at policies.google.com/privacy.',
          'Smartlook (Smartlook.com, s.r.o.): session recording for signed-in Clients only, to help us diagnose issues and improve the dashboard. See Smartlook\'s privacy policy at smartlook.com/privacy-policy.',
        ],
      },
      'These providers may set their own cookies once you opt into analytics; we don\'t control their retention periods, which are set out in their own policies.',
    ],
  },
  {
    heading: '6. Browser controls',
    body: [
      'In addition to the controls on this site, most browsers let you block or delete cookies directly in their settings. Blocking necessary cookies may prevent parts of the site, including signing in, from working correctly.',
    ],
  },
  {
    heading: '7. Contact us',
    body: [
      'Questions about this Cookie Policy can be sent to privacy@shortyharris.com.',
    ],
  },
];

export function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      description="How Shorty Harris uses cookies and similar tracking technologies, and how to control your preferences."
      path="/cookies"
      lastUpdated="August 31, 2026"
      intro="This policy describes the cookies and tracking technologies used on shortyharris.com and in the Shorty Harris dashboard, and how you can manage your preferences."
      sections={SECTIONS}
    />
  );
}
