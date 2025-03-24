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
