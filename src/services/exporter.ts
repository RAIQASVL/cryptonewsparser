import * as fs from "fs";
import * as path from "path";
import { NewsItem } from "../types/news";
import { ensureDirectoryExists } from "../utils/parser-utils";

export class NewsExporter {
  /**
   * Export news items to JSON file
   */
  static exportToJson(items: NewsItem[], filePath: string): void {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
    console.log(`Exported ${items.length} items to ${filePath}`);
  }

  /**
   * Export news items to CSV file
   */
  static exportToCsv(items: NewsItem[], filePath: string): void {
    ensureDirectoryExists(path.dirname(filePath));

    // Create CSV header
    const headers = [
      "source",
      "url",
      "title",
      "description",
      "published_at",
      "fetched_at",
      "category",
      "author",
      "content_type",
    ];

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...items.map((item) =>
        [
          `"${item.source}"`,
          `"${item.url}"`,
          `"${(item.title || "").replace(/"/g, '""')}"`,
          `"${(item.description || "").replace(/"/g, '""')}"`,
          `"${item.published_at}"`,
          `"${item.fetched_at}"`,
          `"${(item.category || "").replace(/"/g, '""')}"`,
          `"${(item.author || "").replace(/"/g, '""')}"`,
          `"${(item.content_type || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ].join("\n");

    fs.writeFileSync(filePath, csvContent);
    console.log(`Exported ${items.length} items to ${filePath}`);
  }

  /**
   * Export analytics results to JSON
   */
  static exportAnalyticsToJson(data: any, filePath: string): void {
    ensureDirectoryExists(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Exported analytics data to ${filePath}`);
  }
}
