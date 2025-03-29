import { BaseParser } from "./BaseParser";
import { coinTelegraphConfig } from "../config/parsers/coinTelegraph.config";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  sanitizeNewsItem,
} from "../utils/parser-utils";

export class CoinTelegraphParser extends BaseParser {
  constructor() {
    super("CoinTelegraph", coinTelegraphConfig);
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.log(`Navigating to ${this.config.url}...`);

      // Use settings from original script
      await this.page.goto(this.config.url, {
        waitUntil: "load",
        timeout: 60000,
      });

      // Check for blockers
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(
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
      this.log(`Found ${newsItemsCount} news items directly`);

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

      this.log(`Extracted ${newsItems.length} news items`);

      // If no news found, try alternative method
      if (newsItems.length === 0) {
        this.log("No news items found, trying alternative method", "warn");
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
          this.log(`Error processing news item: ${error}`, "error");
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.log(`Error extracting news items: ${error}`, "error");
      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    try {
      this.log(`Navigating to article: ${url}`);

      // Use existing page instead of creating a new one
      if (!this.page) throw new Error("Page not initialized");

      // Use domcontentloaded instead of networkidle for faster loading
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Extract article content
      const articleSelectors = this.config.articleSelectors;
      const content = await this.page.evaluate((selectors) => {
        // Function to find element by multiple selectors
        const findElement = (selectors: string[]): Element | null => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
          }
          return null;
        };

        // Find title
        const titleSelectors = [
          selectors.title,
          "h1",
          ".article-title",
          ".post-title",
        ];
        const title =
          findElement(titleSelectors)?.textContent?.trim() || "No title";

        // Find subtitle
        const subtitleSelectors = [
          selectors.subtitle || "",
          ".article-subtitle",
          ".post-subtitle",
          ".excerpt",
        ];
        const subtitle =
          findElement(subtitleSelectors)?.textContent?.trim() || "";

        // Find author
        const authorSelectors = [
          selectors.author || "",
          ".author",
          ".post-author",
          ".byline",
        ];
        const author = findElement(authorSelectors)?.textContent?.trim() || "";

        // Find date
        const dateSelectors = [
          selectors.date || "",
          ".post-meta__publish-date",
          ".post-date",
          ".date",
        ];
        let date = "";
        for (const selector of dateSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            date = element.textContent.trim();
            break;
          }
        }

        // Get content
        const contentElements = Array.from(
          document.querySelectorAll(
            `${selectors.content} p, ${selectors.content} h2, ${selectors.content} h3, ${selectors.content} ul, ${selectors.content} ol`
          )
        );

        let fullText = `# ${title || "No title"}\n\n`;
        if (subtitle) fullText += `${subtitle}\n\n`;
        if (author || date)
          fullText += `Author: ${author || "N/A"} | Date: ${date || "N/A"}\n\n`;

        if (contentElements.length === 0) {
          fullText += "Failed to extract article content.\n\n";

          // Try to get at least some text from the page
          const allParagraphs = Array.from(document.querySelectorAll("p"));
          if (allParagraphs.length > 0) {
            fullText += "Found paragraphs:\n\n";
            allParagraphs.forEach((p) => {
              const text = p.textContent?.trim();
              if (text) fullText += `${text}\n\n`;
            });
          }
        } else {
          contentElements.forEach((element) => {
            const text = element.textContent?.trim() || "";
            if (!text) return;

            switch (element.tagName.toLowerCase()) {
              case "h2":
                fullText += `## ${text}\n\n`;
                break;
              case "h3":
                fullText += `### ${text}\n\n`;
                break;
              case "ul":
              case "ol":
                const items = Array.from(element.querySelectorAll("li"))
                  .map((li) => `- ${li.textContent?.trim()}`)
                  .join("\n");
                fullText += `${items}\n\n`;
                break;
              default:
                fullText += `${text}\n\n`;
            }
          });
        }

        return fullText;
      }, articleSelectors);

      return content;
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return "Failed to extract content";
    }
  }

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.log("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      const rssUrls = [
        "https://cointelegraph.com/rss",
        "https://cointelegraph.com/feed",
        "https://cointelegraph.com/rss/tag/bitcoin",
      ];

      for (const rssUrl of rssUrls) {
        this.log(`Trying RSS feed: ${rssUrl}`, "info");
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

      this.log("RSS feeds not available, trying other methods", "warn");
      return [];
    } catch (error) {
      this.log(`Alternative extraction failed: ${error}`, "error");
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
      this.log(`Error parsing RSS feed: ${error}`, "error");
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
      this.log(`Error during human behavior simulation: ${error}`, "warn");
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
