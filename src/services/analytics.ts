import { newsRepository } from "./db";
import { NewsItem } from "../types/news";

export class NewsAnalytics {
  /**
   * Get the distribution of news by source
   */
  static async getSourceDistribution(): Promise<Record<string, number>> {
    const items = await newsRepository.getRecentItems(1000);
    const distribution: Record<string, number> = {};

    items.forEach((item) => {
      distribution[item.source] = (distribution[item.source] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Get the most common categories across all news
   */
  static async getTopCategories(
    limit: number = 10
  ): Promise<{ category: string; count: number }[]> {
    const items = await newsRepository.getRecentItems(1000);
    const categories: Record<string, number> = {};

    items.forEach((item) => {
      if (item.category) {
        categories[item.category] = (categories[item.category] || 0) + 1;
      }
    });

    return Object.entries(categories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get news volume by day for the past n days
   */
  static async getNewsVolumeByDay(
    days: number = 30
  ): Promise<{ date: string; count: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const items = await newsRepository.getItemsByDateRange(
      startDate,
      endDate,
      10000
    );

    const volumeByDay: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      volumeByDay[dateStr] = 0;
    }

    // Count news items by day
    items.forEach((item) => {
      const dateStr = new Date(item.published_at).toISOString().split("T")[0];
      volumeByDay[dateStr] = (volumeByDay[dateStr] || 0) + 1;
    });

    return Object.entries(volumeByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Find trending topics based on word frequency in titles and descriptions
   */
  static async getTrendingTopics(
    days: number = 7,
    topN: number = 20
  ): Promise<{ word: string; count: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const items = await newsRepository.getItemsByDateRange(
      startDate,
      endDate,
      1000
    );

    // Combine all titles and descriptions
    const text = items
      .map((item) => `${item.title} ${item.description}`)
      .join(" ");

    // Simple word frequency analysis (could be improved with NLP libraries)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3) // Filter out short words
      .filter(
        (word) =>
          !["this", "that", "with", "from", "have", "what"].includes(word)
      ); // Filter common words

    const wordCounts: Record<string, number> = {};
    words.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    return Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
}
