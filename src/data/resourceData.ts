export interface ResourceArticle {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string; // lucide icon name
  readTime: string;
  category: string;
  keywords: string[];
}

export const resourceArticles: ResourceArticle[] = [
  {
    slug: 'nj-building-permits',
    title: 'NJ Building Permits Guide: What Homeowners Need to Know',
    shortTitle: 'NJ Building Permits Guide',
    description:
      'Learn which building permits are required for home renovations in New Jersey, how to obtain them, timelines, costs, and what happens if you skip them.',
    icon: 'ClipboardCheck',
    readTime: '8 min read',
    category: 'Planning',
    keywords: [
      'NJ building permits',
      'home renovation permits',
      'New Jersey construction permits',
      'building permit timeline',
      'do I need a permit NJ',
    ],
  },
  {
    slug: 'renovation-timeline',
    title: 'Renovation Timeline Expectations: How Long Does a Remodel Take?',
    shortTitle: 'Renovation Timelines',
    description:
      'Realistic timelines for kitchen, bathroom, basement, and addition projects in NJ. Know what to expect and how to plan around your renovation.',
    icon: 'Clock',
    readTime: '7 min read',
    category: 'Planning',
    keywords: [
      'renovation timeline',
      'how long does a kitchen remodel take',
      'bathroom renovation timeline',
      'basement finishing timeline',
      'home addition timeline NJ',
    ],
  },
  {
    slug: 'choosing-materials',
    title: 'How to Choose Materials for Your Home Renovation',
    shortTitle: 'Choosing Materials',
    description:
      'A homeowner\'s guide to selecting countertops, flooring, cabinets, fixtures, and more. Compare options, durability, costs, and what works best for NJ homes.',
    icon: 'Layers',
    readTime: '9 min read',
    category: 'Materials',
    keywords: [
      'renovation materials guide',
      'how to choose countertops',
      'best flooring for renovation',
      'kitchen cabinet materials',
      'choosing fixtures for remodel',
    ],
  },
  {
    slug: 'financing-your-renovation',
    title: 'Financing Your Renovation: Options, Tips, and Budgeting',
    shortTitle: 'Financing Your Renovation',
    description:
      'Explore financing options for your home renovation including home equity loans, personal loans, and payment plans. Plus budgeting tips to keep costs in check.',
    icon: 'DollarSign',
    readTime: '7 min read',
    category: 'Budget',
    keywords: [
      'financing home renovation',
      'home equity loan renovation',
      'renovation budget tips',
      'how to pay for remodel',
      'home improvement loan NJ',
    ],
  },
  {
    slug: 'working-with-contractor',
    title: 'Working With Your Contractor: Communication Tips and What to Expect',
    shortTitle: 'Working With Your Contractor',
    description:
      'Get the most out of your contractor relationship. Communication tips, what to expect during construction, red flags, and how to handle changes.',
    icon: 'Handshake',
    readTime: '8 min read',
    category: 'Process',
    keywords: [
      'working with contractor',
      'contractor communication tips',
      'what to expect during renovation',
      'home renovation process',
      'contractor relationship tips NJ',
    ],
  },
];

export function getResourceBySlug(slug: string): ResourceArticle | undefined {
  return resourceArticles.find((a) => a.slug === slug);
}

export function getAllResourceSlugs(): string[] {
  return resourceArticles.map((a) => a.slug);
}
