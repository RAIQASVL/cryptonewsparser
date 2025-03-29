import { PrismaClient } from "@prisma/client";
import { NewsItem } from "../types/news";

class NewsRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async saveItems(items: NewsItem[]): Promise<number> {
    try {
      console.log(`Saving ${items.length} news items to database...`);

      // Convert NewsItem to PrismaNewsItem format
      const dbItems = items.map((item) => ({
        source: item.source,
        url: item.url,
        title: item.title,
        description: item.description,
        published_at: new Date(item.published_at),
        fetched_at: new Date(item.fetched_at),
        category: item.category,
        author: item.author,
        content_type: item.content_type,
        full_content: item.full_content,
        preview_content: item.preview_content,
      }));

      // Use createMany for bulk insertion with skipDuplicates
      const result = await this.prisma.newsItem.createMany({
        data: dbItems,
        skipDuplicates: true,
      });

      console.log(`${result.count} news items saved successfully`);
      return result.count;
    } catch (error) {
      console.error("Error saving news items to database:", error);
      throw error;
    }
  }

  async getRecentItems(limit: number = 100): Promise<NewsItem[]> {
    try {
      const items = await this.prisma.newsItem.findMany({
        orderBy: {
          published_at: "desc",
        },
        take: limit,
      });

      // Convert Prisma dates to strings for NewsItem interface
      return items.map((item) => ({
        ...item,
        published_at: item.published_at.toISOString(),
        fetched_at: item.fetched_at.toISOString(),
      }));
    } catch (error) {
      console.error("Error fetching recent news items:", error);
      throw error;
    }
  }

  async getItemsBySource(
    source: string,
    limit: number = 50
  ): Promise<NewsItem[]> {
    try {
      const items = await this.prisma.newsItem.findMany({
        where: {
          source,
        },
        orderBy: {
          published_at: "desc",
        },
        take: limit,
      });

      // Convert Prisma dates to strings for NewsItem interface
      return items.map((item) => ({
        ...item,
        published_at: item.published_at.toISOString(),
        fetched_at: item.fetched_at.toISOString(),
      }));
    } catch (error) {
      console.error(`Error fetching news items for source ${source}:`, error);
      throw error;
    }
  }

  async getItemsByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): Promise<NewsItem[]> {
    try {
      const items = await this.prisma.newsItem.findMany({
        where: {
          published_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          published_at: "desc",
        },
        take: limit,
      });

      return items.map((item) => ({
        ...item,
        published_at: item.published_at.toISOString(),
        fetched_at: item.fetched_at.toISOString(),
      }));
    } catch (error) {
      console.error("Error fetching news items by date range:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Create a singleton instance
const newsRepository = new NewsRepository();

// Export functions that use the repository
export const saveNewsItems = (items: NewsItem[]) =>
  newsRepository.saveItems(items);
export const getRecentNewsItems = (limit?: number) =>
  newsRepository.getRecentItems(limit);
export const getNewsBySource = (source: string, limit?: number) =>
  newsRepository.getItemsBySource(source, limit);
export const getNewsByDateRange = (
  startDate: Date,
  endDate: Date,
  limit?: number
) => newsRepository.getItemsByDateRange(startDate, endDate, limit);
export const disconnect = () => newsRepository.disconnect();

// Export the repository for more advanced usage
export { newsRepository };
