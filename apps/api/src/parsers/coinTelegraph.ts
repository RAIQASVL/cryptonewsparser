import { BaseParser, ParserConfig } from "./BaseParser";
import { coinTelegraphConfig } from "../config/parsers/coinTelegraph.config";
import { NewsItem } from "@cryptonewsparser/shared";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { ParserOptions } from "../utils/parser-factory";

export class CoinTelegraphParser extends BaseParser {
  constructor(options: ParserOptions) {
    super("CoinTelegraph", coinTelegraphConfig, options);
    this.logMessage("CoinTelegraphParser initialized");
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.logMessage(`Navigating to ${this.config.url}...`);

      // Use settings from original script
      await this.page.goto(this.config.url, {
        waitUntil: "load",
        timeout: 60000,
      });

      // Check for blockers
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.logMessage(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Check for news items directly
      const newsItemsCount = await this.page.$$eval(
        this.config.selectors.newsItem,
        (items) => items.length
      );
      this.logMessage(`Found ${newsItemsCount} news items directly`);

      // Get news directly, without using container
      const newsItems = await this.page.evaluate((selectors) => {
        const items: Array<{
          title: string;
          description: string;
          category: string | null;
          published_time: string;
          author: string | null;
          url: string;
          image_url: string | null;
          is_video: boolean;
        }> = [];

        const elements = document.querySelectorAll(selectors.newsItem);

        elements.forEach((element) => {
          const title =
            element.querySelector(selectors.title)?.textContent?.trim() || "";
          const description =
            (element
              .querySelector(selectors.description || "")
              ?.textContent?.trim() as string) || "";
          const category =
            (element
              .querySelector(selectors.category || "")
              ?.textContent?.trim() as string) || null;
          const publishedTime =
            (element
              .querySelector(selectors.date || "")
              ?.getAttribute("datetime") as string) || "";
          const author =
            (element
              .querySelector(selectors.author || "")
              ?.textContent?.trim() as string) || null;
          const url =
            (element
              .querySelector(selectors.link || "")
              ?.getAttribute("href") as string) || "";
          const imageUrl =
            (element
              .querySelector(selectors.image || "")
              ?.getAttribute("src") as string) ||
            (element
              .querySelector(selectors.image || "")
              ?.getAttribute("data-src") as string) ||
            null;

          // Check if item has required fields
          if (title && url) {
            items.push({
              title,
              description,
              category,
              published_time: publishedTime,
              author,
              url,
              image_url: imageUrl,
              is_video: false,
            });
          }
        });

        return items;
      }, this.config.selectors);

      this.logMessage(`Extracted ${newsItems.length} news items`);

      // If no news found, try alternative method
      if (newsItems.length === 0) {
        this.logMessage(
          "No news items found, trying alternative method",
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Process each news item
      const news: NewsItem[] = [];
      const itemsToProcess = newsItems.slice(0, 10); // Process up to 10 items

      for (const item of itemsToProcess) {
        try {
          const rawNewsItem = {
            source: this.sourceName,
            url: normalizeUrl(item.url, this.baseUrl),
            title: cleanText(item.title),
            description: cleanText(item.description || ""),
            published_at: item.published_time
              ? normalizeDate(item.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: item.category ? cleanText(item.category) : null,
            author: item.author ? cleanText(item.author) : null,
            content_type: "Article",
            full_content: await this.extractArticleContent(
              normalizeUrl(item.url, this.baseUrl)
            ),
            preview_content: item.description
              ? cleanText(item.description)
              : null,
          };

          // Use sanitizeNewsItem
          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);

          // Add random delay between requests
          await this.randomDelay(2000, 5000);
        } catch (error) {
          this.logMessage(`Error processing news item: ${error}`, "error");
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.logMessage(`Error extracting news items: ${error}`, "error");
      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page)
      throw new Error("Page not initialized for extractArticleContent");
    this.logMessage(`Extracting content from: ${url}`);

    // Navigate to the article page
    await this.page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    this.logMessage(`Navigated to article page: ${url}`);

    // Use the selectors defined in this.config.articleSelectors
    const contentSelector = this.config.articleSelectors.content;

    try {
      const contentElement = await this.page.waitForSelector(contentSelector, {
        timeout: 15000,
      });
      if (!contentElement) {
        this.logMessage(
          `Content element not found using selector: ${contentSelector}`,
          "warn"
        );
        return "";
      }
      // Example: Extract text content. Adjust based on actual structure.
      const textContent = await contentElement.textContent();
      const cleanedContent = cleanText(textContent || ""); // Use cleanText util
      this.logMessage(
        `Extracted content length: ${cleanedContent.length}`,
        "debug"
      );
      return cleanedContent;
    } catch (error) {
      this.logMessage(
        `Error extracting article content from ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      // Save screenshot on article extraction error too?
      // if (this.page) { /* ... screenshot logic ... */ }
      return ""; // Return empty string or throw error depending on desired behavior
    }
  }

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.logMessage("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      const rssUrls = [
        "https://cointelegraph.com/rss",
        "https://cointelegraph.com/feed",
        "https://cointelegraph.com/rss/tag/bitcoin",
      ];

      for (const rssUrl of rssUrls) {
        this.logMessage(`Trying RSS feed: ${rssUrl}`, "info");
        await this.page?.goto(rssUrl, { timeout: 30000 });

        const rssContent = await this.page?.content();

        if (
          rssContent &&
          (rssContent.includes("<rss") || rssContent.includes("<feed")) &&
          (rssContent.includes("<item>") || rssContent.includes("<entry>"))
        ) {
          return this.parseRssFeed(rssContent);
        }
      }

      this.logMessage("RSS feeds not available, trying other methods", "warn");
      return [];
    } catch (error) {
      this.logMessage(`Alternative extraction failed: ${error}`, "error");
      return [];
    }
  }

  // Method for parsing RSS feed
  private async parseRssFeed(rssContent: string): Promise<NewsItem[]> {
    const news: NewsItem[] = [];

    try {
      // Use a more reliable approach with regular expressions
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/;
      const linkRegex = /<link[^>]*>([\s\S]*?)<\/link>/;
      const descRegex = /<description[^>]*>([\s\S]*?)<\/description>/;
      const pubDateRegex = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/;
      const categoryRegex = /<category[^>]*>([\s\S]*?)<\/category>/g;
      const creatorRegex = /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/;
      const contentRegex =
        /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/;
      const mediaRegex = /<media:content[^>]*url="([^"]*)"[^>]*>/;

      let match;
      while ((match = itemRegex.exec(rssContent)) !== null) {
        const itemContent = match[1];

        const titleMatch = titleRegex.exec(itemContent);
        const linkMatch = linkRegex.exec(itemContent);
        const descMatch = descRegex.exec(itemContent);
        const pubDateMatch = pubDateRegex.exec(itemContent);
        const creatorMatch = creatorRegex.exec(itemContent);
        const contentMatch = contentRegex.exec(itemContent);
        const mediaMatch = mediaRegex.exec(itemContent);

        if (titleMatch && linkMatch) {
          const title = this.cleanHtml(titleMatch[1]);
          const url = normalizeUrl(linkMatch[1], this.baseUrl);
          const description = descMatch ? this.cleanHtml(descMatch[1]) : "";
          const publishedAt = pubDateMatch
            ? normalizeDate(pubDateMatch[1])
            : new Date().toISOString();
          const author = creatorMatch ? this.cleanHtml(creatorMatch[1]) : null;
          const fullContent = contentMatch
            ? this.cleanHtml(contentMatch[1])
            : null;
          const imageUrl = mediaMatch ? mediaMatch[1] : null;

          // Extract categories
          const categories: string[] = [];
          let categoryMatch;
          while ((categoryMatch = categoryRegex.exec(itemContent)) !== null) {
            categories.push(this.cleanHtml(categoryMatch[1]));
          }

          const rawNewsItem = {
            source: this.sourceName,
            url,
            title,
            description,
            published_at: publishedAt,
            fetched_at: new Date().toISOString(),
            category: categories.length > 0 ? categories[0] : null,
            author,
            content_type: "News",
            full_content: fullContent || description,
            preview_content: description ? cleanText(description) : null,
          };

          // Use sanitizeNewsItem
          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);
        }
      }
    } catch (error) {
      this.logMessage(`Error parsing RSS feed: ${error}`, "error");
    }

    await this.saveResults(news);
    return news;
  }

  // Helper method to clean HTML tags
  private cleanHtml(html: string): string {
    return html
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  protected async simulateHumanBehavior(): Promise<void> {
    if (!this.page) return;

    try {
      // Random scrolling
      const scrollAmount = Math.floor(Math.random() * 5) + 3; // 3-7 scrolls
      for (let i = 0; i < scrollAmount; i++) {
        await this.page.mouse.wheel(0, Math.floor(Math.random() * 300) + 100);
        await this.page.waitForTimeout(Math.floor(Math.random() * 500) + 300);
      }

      // Random mouse movements
      const moveAmount = Math.floor(Math.random() * 3) + 2; // 2-4 movements
      for (let i = 0; i < moveAmount; i++) {
        await this.page.mouse.move(
          Math.floor(Math.random() * 800) + 100,
          Math.floor(Math.random() * 600) + 100
        );
        await this.page.waitForTimeout(Math.floor(Math.random() * 300) + 200);
      }
    } catch (error) {
      this.logMessage(
        `Error during human behavior simulation: ${error}`,
        "warn"
      );
    }
  }

  protected async randomDelay(
    min: number = 1000,
    max: number = 3000
  ): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
