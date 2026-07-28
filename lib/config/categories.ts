export interface CategoryGroup {
  key: string;
  label: string;
  primaryTag: string;
  childTags: string[];
  icon: string;
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'politics',
    label: 'Politics',
    primaryTag: 'Politics',
    childTags: [
      'Elections', 'US Elections', 'Congress', 'Government', 'Republican',
      'Democrat', 'Legislation', 'Supreme Court', 'Executive', 'Senate',
      'House', 'Political Parties',
    ],
    icon: 'politics',
  },
  {
    key: 'world',
    label: 'World',
    primaryTag: 'World',
    childTags: [
      'Geopolitics', 'Middle East', 'China', 'Europe', 'Asia',
      'Latin America', 'Africa', 'India', 'Canada', 'UK', 'Russia',
      'Ukraine', 'EU', 'Immigration', 'NATO', 'Diplomacy',
    ],
    icon: 'world',
  },
  {
    key: 'crypto',
    label: 'Crypto',
    primaryTag: 'Crypto',
    childTags: [
      'Bitcoin', 'Ethereum', 'Solana', 'DeFi', 'NFT', 'Altcoins',
      'Stablecoins', 'Blockchain', 'Web3', 'Memecoins', 'Layer 2', 'Mining',
    ],
    icon: 'crypto',
  },
  {
    key: 'sports',
    label: 'Sports',
    primaryTag: 'Sports',
    childTags: [
      'NFL', 'NBA', 'Soccer', 'MLB', 'Tennis', 'MMA', 'UFC', 'Golf',
      'F1', 'Hockey', 'Boxing', 'Olympics', 'NCAA', 'FIFA',
    ],
    icon: 'sports',
  },
  {
    key: 'finance',
    label: 'Finance',
    primaryTag: 'Finance',
    childTags: [
      'Economics', 'Federal Reserve', 'Stocks', 'Interest Rates', 'GDP',
      'Inflation', 'Markets', 'IPO', 'Commodities', 'Real Estate',
      'Banking', 'Bonds', 'S&P 500', 'Nasdaq',
    ],
    icon: 'finance',
  },
  {
    key: 'tech',
    label: 'Tech',
    primaryTag: 'Tech',
    childTags: [
      'Technology', 'Big Tech', 'AI', 'Artificial Intelligence', 'Apple',
      'Google', 'Microsoft', 'Tesla', 'Amazon', 'Meta', 'Nvidia',
      'Semiconductors', 'Space', 'Robotics', 'Social Media',
    ],
    icon: 'tech',
  },
  {
    key: 'culture',
    label: 'Culture',
    primaryTag: 'Culture',
    childTags: [
      'Pop Culture', 'Entertainment', 'Music', 'Movies', 'Television',
      'Awards', 'Celebrities', 'Gaming', 'Streaming', 'YouTube', 'TikTok',
      'Oscars', 'Grammy', 'Emmy',
    ],
    icon: 'culture',
  },
  {
    key: 'science',
    label: 'Science',
    primaryTag: 'Science',
    childTags: [
      'Climate', 'Weather', 'Health', 'Medicine', 'Pandemic', 'FDA',
      'Pharma', 'Environment', 'Energy', 'Nuclear', 'Biotech', 'Research',
      'Space Exploration',
    ],
    icon: 'science',
  },
  {
    key: 'business',
    label: 'Business',
    primaryTag: 'Business',
    childTags: [
      // Real Polymarket tags (have markets → the expand chevron shows):
      'Equities', 'Economy', 'FDV', 'Privates', 'Macro Indicators', 'Commodities',
      // plus sensible corporate tags in case they appear:
      'Companies', 'Earnings', 'Mergers', 'Startups', 'Bankruptcy', 'CEO', 'Corporate',
    ],
    icon: 'finance',
  },
  {
    key: 'trump',
    label: 'Trump',
    primaryTag: 'Trump',
    childTags: [
      'MAGA', 'Trump Administration', 'Tariffs', 'Trump Cabinet',
      'Presidential Actions', 'Deportation',
    ],
    icon: 'politics',
  },
  {
    key: 'elon',
    label: 'Elon',
    primaryTag: 'Elon Musk',
    childTags: [
      'Elon', 'SpaceX', 'xAI', 'Neuralink', 'Starship', 'X (Twitter)', 'DOGE',
    ],
    icon: 'tech',
  },
  {
    key: 'mentions',
    label: 'Mentions',
    primaryTag: 'Mentions',
    childTags: [
      'Tweets', 'Speeches', 'Quotes', 'Statements', 'Interviews', 'Truth Social',
    ],
    icon: 'culture',
  },
];

/** Set of all tags claimed by a category group (primary + children) */
export const CLAIMED_TAGS = new Set(
  CATEGORY_GROUPS.flatMap(g => [g.primaryTag, ...g.childTags]),
);
