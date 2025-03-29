// News item interface
export interface NewsItem {
  source: string;
  url: string;
  title: string;
  description: string;
  published_at: string;
  fetched_at: string;
  category: string | null;
  author: string | null;
  content_type: string | null;
  full_content?: string | null;
  preview_content?: string | null;
}
