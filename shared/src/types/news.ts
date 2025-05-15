// News item interface
export interface NewsItem {
  id?: number;
  source: string;
  url: string;
  title: string;
  description: string | null;
  published_at: string;
  fetched_at: string;
  category: string | null;
  author: string | null;
  content_type: string | null;
  full_content: string | null;
  preview_content?: string | null;
  edited_content?: string | null;
}
