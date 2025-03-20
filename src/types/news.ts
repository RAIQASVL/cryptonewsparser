// News item interface
export interface NewsItem {
  source: string;
  url: string;
  title: string;
  description: string;
  published_at: string;
  fetched_at: string;
  category: string | null;
  image_url: string | null;
  author: string | null;
  tags: string[];
  content_type: string | null;
  reading_time: string | null;
  views: string | null;
  full_content?: string | null;
  preview_content?: string | null;
}
