export interface ParserSelectors {
  newsContainer: string;
  newsItem: string;
  title: string;
  description: string;
  category: string;
  author: string;
  date: string;
  link: string;
  image: string;
}

export interface ArticleSelectors {
  content: string;
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  tags?: string;
}

export interface ParserConfig {
  selectors: ParserSelectors;
  articleSelectors: ArticleSelectors;
  url: string;
}

// Define the SiteName type alias
export type SiteName =
  | "cryptonews"
  | "cointelegraph"
  | "coindesk"
  | "decrypt"
  | "theblock"
  | "ambcrypto"
  | "bitcoinmagazine"
  | "bitcoincom"
  | "beincrypto"
  | "watcherguru"
  | "cryptoslate"
  | "bitcoinist";

// Export the array of all site names
export const ALL_SITE_NAMES_ARRAY: SiteName[] = [
  "cryptonews",
  "cointelegraph",
  "coindesk",
  "decrypt",
  "theblock",
  "ambcrypto",
  "bitcoinmagazine",
  "bitcoincom",
  "beincrypto",
  "watcherguru",
  "cryptoslate",
  "bitcoinist",
];

// For convenience, also export as ALL_SITE_NAMES
export const ALL_SITE_NAMES = ALL_SITE_NAMES_ARRAY;

// Interface for parser options (can be shared if needed)
export interface SharedParserOptions {
  headless?: boolean;
  // Add other shared options if applicable
}
