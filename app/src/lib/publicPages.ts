// Title/description for static public pages. Shared by the React screens
// (useSeo) and scripts/generate-blog-html.ts, which writes a real
// dist/<path>/index.html per page so crawlers don't get the homepage shell.
export interface PublicPageSeo {
  path: string;
  title: string;
  description: string;
}

export const PUBLIC_PAGES = {
  pricing: {
    path: '/pricing',
    title: 'Pricing - Shorty Harris',
    description: 'No subscription and no setup fee. You buy credits and only use one when a business replies with real interest and becomes a hot lead.',
  },
  blog: {
    path: '/blog',
    title: 'Blog',
    description: 'Practical advice for growing your small or family business - outreach strategy, local business development, and growth tips.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'How Shorty Harris collects, uses, and protects your information, including data accessed via Google APIs.',
  },
  terms: {
    path: '/terms',
    title: 'Terms of Service',
    description: 'The terms that govern your use of Shorty Harris, including outreach sent via connected Gmail accounts.',
  },
  cookies: {
    path: '/cookies',
    title: 'Cookie Policy',
    description: 'How Shorty Harris uses cookies and similar tracking technologies, and how to control your preferences.',
  },
  gmailDataUse: {
    path: '/gmail-data-use',
    title: 'How we use your Gmail',
    description: 'Why Shorty Harris asks for Gmail access, what we do with it, and how to disconnect it at any time.',
  },
} satisfies Record<string, PublicPageSeo>;
