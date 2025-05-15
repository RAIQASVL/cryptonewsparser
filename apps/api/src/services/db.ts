import { PrismaClient, NewsItem as PrismaNewsItem } from "@prisma/client";
import { NewsItem } from "@cryptonewsparser/shared";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// Create a PrismaClient instance
const prisma = new PrismaClient();

class NewsRepository {
  private prisma: any;

  constructor() {
    this.prisma = prisma;
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
      return items.map((item: any) => ({
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
      return items.map((item: any) => ({
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

      return items.map((item: any) => ({
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

  async getLatestNews(limit: number = 20): Promise<PrismaNewsItem[]> {
    return this.prisma.newsItem.findMany({
      orderBy: {
        published_at: "desc",
      },
      take: limit,
    });
  }

  async getSourceStats(): Promise<any> {
    console.warn("getSourceStats function not fully implemented.");
    return {};
  }

  async getTrendingTopics(
    days: number = 7,
    limit: number = 20
  ): Promise<any[]> {
    console.warn("getTrendingTopics function not fully implemented.");
    return [];
  }

  async getNewsItemById(id: number): Promise<PrismaNewsItem | null> {
    return this.prisma.newsItem.findUnique({
      where: { id },
    });
  }

  async updateNewsItemContent(
    id: number,
    editedContent: string
  ): Promise<PrismaNewsItem | null> {
    try {
      const updatedItem = await this.prisma.newsItem.update({
        where: { id: id },
        data: { edited_content: editedContent },
      });
      return updatedItem;
    } catch (error) {
      console.error(`Error updating news item ${id}:`, error);
      return null;
    }
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

export async function getLatestNews(
  limit: number = 20
): Promise<PrismaNewsItem[]> {
  return newsRepository.getLatestNews(limit);
}

export async function getSourceStats(): Promise<any> {
  return newsRepository.getSourceStats();
}

export async function getTrendingTopics(
  days: number = 7,
  limit: number = 20
): Promise<any[]> {
  return newsRepository.getTrendingTopics(days, limit);
}

export async function getNewsItemById(
  id: number
): Promise<PrismaNewsItem | null> {
  return newsRepository.getNewsItemById(id);
}

export async function updateNewsItemContent(
  id: number,
  editedContent: string
): Promise<PrismaNewsItem | null> {
  return newsRepository.updateNewsItemContent(id, editedContent);
}
