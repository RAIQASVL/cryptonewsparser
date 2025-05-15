import { NewsItem } from "@cryptonewsparser/shared";

/**
 * Sanitizes a raw news item object to match the NewsItem interface
 * Removes any properties that aren't part of the NewsItem interface
 * @param item Raw news item with potentially extra properties
 * @returns A clean NewsItem object
 */
export function sanitizeNewsItem(item: any): NewsItem {
  return {
    source: item.source,
    url: item.url,
    title: item.title,
    description: item.description,
    published_at: item.published_at,
    fetched_at: item.fetched_at,
    category: item.category,
    author: item.author,
    content_type: item.content_type || null,
    full_content: item.full_content,
    preview_content: item.preview_content,
    edited_content: item.edited_content,
  };
}
