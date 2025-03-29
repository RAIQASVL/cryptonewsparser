import { chromium, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { cryptoNewsConfig } from "../config/parsers/cryptoNews.config";
import { getStructuredOutputPath } from "../utils/parser-utils";

// Parser for CryptoNews
export class CryptoNewsParser extends BaseParser {
  constructor() {
    super("CryptoNews", cryptoNewsConfig);
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.log(`Navigating to ${this.config.url}...`);

      // Load the page with more reliable parameters
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Check for blockers
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Save debug screenshot
      await this.saveDebugScreenshot("cryptonews_initial");

      // Wait for news container
      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => this.log("News container not found", "warn"));

      // Extract news items
      const newsItems = await this.page.evaluate((selectors) => {
        const items: any[] = [];

        // Check if news container exists
        const container = document.querySelector(selectors.newsContainer);
        if (!container) {
          console.error("News container not found");
          return items;
        }

        // Get all news elements
        const elements = container.querySelectorAll(selectors.newsItem);
        if (!elements || elements.length === 0) {
          console.error("No news items found");
          return items;
        }

        // Process each news element
        elements.forEach((element) => {
          try {
            // Extract title
            const titleElement = element.querySelector(selectors.title);
            const title = titleElement?.textContent?.trim() || "No title";

            // Extract URL
            const linkElement = element.querySelector(selectors.link);
            const url = linkElement?.getAttribute("href") || "";
            if (!url) return; // Skip items without URL

            // Extract description
            let description = "";
            if (selectors.description) {
              const descElement = element.querySelector(selectors.description);
              description = descElement?.textContent?.trim() || "";
            }

            // Extract date
            let publishedTime = "";
            if (selectors.date) {
              const dateElement = element.querySelector(selectors.date);
              publishedTime =
                dateElement?.getAttribute("datetime") ||
                dateElement?.textContent?.trim() ||
                "";
            }

            // Extract image
            let imageUrl = null;
            if (selectors.image) {
              const imageElement = element.querySelector(selectors.image);
              imageUrl =
                imageElement?.getAttribute("src") ||
                imageElement?.getAttribute("data-src") ||
                null;
            }

            // Extract author
            let author = null;
            if (selectors.author) {
              const authorElement = element.querySelector(selectors.author);
              author = authorElement?.textContent?.trim() || null;
            }

            // Extract category
            let category = null;
            if (selectors.category) {
              const categoryElement = element.querySelector(selectors.category);
              category = categoryElement?.textContent?.trim() || null;
            }

            // Add item to results
            items.push({
              title,
              url,
              description,
              published_at: publishedTime,
              author,
              category,
              image_url: imageUrl,
              source: this.sourceName,
              fetched_at: new Date().toISOString(),
              tags: [],
              content_type: "Article",
              reading_time: null,
              views: null,
              full_content: null,
            });
          } catch (error) {
            console.error(`Error processing news item: ${error}`);
          }
        });

        return items;
      }, this.config.selectors);

      this.log(`Found ${newsItems.length} news items`);

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
            published_at: item.published_at
              ? normalizeDate(item.published_at)
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

      // Save error screenshot
      if (this.page) {
        const errorScreenshotPath = path.join(
          __dirname,
          "../../output",
          `error_${this.sourceName.toLowerCase()}.png`
        );
        await this.page.screenshot({
          path: errorScreenshotPath,
          fullPage: true,
        });
        this.log(`Error screenshot saved: ${errorScreenshotPath}`);

        // Save page HTML for analysis
        const htmlContent = await this.page.content();
        const htmlPath = path.join(
          __dirname,
          "../../output",
          `error_${this.sourceName.toLowerCase()}.html`
        );
        fs.writeFileSync(htmlPath, htmlContent);
        this.log(`Page HTML saved: ${htmlPath}`);
      }

      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await this.page
      .waitForSelector(this.config.articleSelectors.content, { timeout: 10000 })
      .catch(() => this.log("Article content not found", "warn"));

    return this.page.evaluate((selectors) => {
      const title =
        document.querySelector(selectors.title)?.textContent?.trim() || "";
      const subtitle = document
        .querySelector(selectors.subtitle || "")
        ?.textContent?.trim() as string;
      const author = document
        .querySelector(selectors.author || "")
        ?.textContent?.trim() as string;
      const date = document
        .querySelector(selectors.date || "")
        ?.textContent?.trim() as string;

      const contentElements = Array.from(
        document.querySelectorAll(
          `${selectors.content} p, ${selectors.content} h2, ${selectors.content} h3, ${selectors.content} ul, ${selectors.content} ol`
        )
      );

      let fullText = `# ${title}\n\n`;
      if (subtitle) fullText += `${subtitle}\n\n`;
      if (author || date)
        fullText += `Author: ${author || "N/A"} | Date: ${date || "N/A"}\n\n`;

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

      return fullText;
    }, this.config.articleSelectors);
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

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.log("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      await this.page?.goto("https://cryptonews.com/news/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Check if RSS feed is available
      const isRssAvailable = await this.page?.evaluate(() => {
        return (
          document.body.innerText.includes("xml") ||
          document.body.innerText.includes("rss") ||
          document.body.innerText.includes("feed")
        );
      });

      if (isRssAvailable) {
        this.log("RSS feed available, extracting news from it", "info");

        // Extract data from RSS
        const rssItems = await this.page?.evaluate(() => {
          const items = Array.from(document.querySelectorAll("item"));
          return items.map((item) => {
            return {
              title: item.querySelector("title")?.textContent || "No title",
              url: item.querySelector("link")?.textContent || "",
              description: item.querySelector("description")?.textContent || "",
              published_time: item.querySelector("pubDate")?.textContent || "",
              author: item.querySelector("creator")?.textContent || null,
              category: item.querySelector("category")?.textContent || null,
            };
          });
        });

        if (rssItems && rssItems.length > 0) {
          // Process extracted articles
          const news: NewsItem[] = [];

          for (const item of rssItems.slice(0, 10)) {
            try {
              const rawNewsItem = {
                source: this.sourceName,
                url: item.url,
                title: cleanText(item.title),
                description: cleanText(item.description || ""),
                published_at: item.published_time
                  ? normalizeDate(item.published_time)
                  : new Date().toISOString(),
                fetched_at: new Date().toISOString(),
                category: item.category ? cleanText(item.category) : null,
                author: item.author ? cleanText(item.author) : null,
                content_type: "Article",
                full_content: item.description || "",
                preview_content: item.description
                  ? cleanText(item.description)
                  : null,
              };

              // Use sanitizeNewsItem
              const newsItem = sanitizeNewsItem(rawNewsItem);
              news.push(newsItem);
            } catch (error) {
              this.log(`Error processing RSS item: ${error}`, "error");
            }
          }

          await this.saveResults(news);
          return news;
        }
      }

      // If RSS didn't work, try a different approach
      this.log("RSS unavailable, trying direct extraction", "info");

      // Try to extract from the mobile version of the site
      await this.page?.goto("https://cryptonews.com/news/amp/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Extract news from mobile version
      const mobileNews = await this.extractNewsFromMobile();
      if (mobileNews.length > 0) {
        return mobileNews;
      }

      // If all methods failed, return empty array
      return [];
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
      return [];
    }
  }

  private async extractNewsFromMobile(): Promise<NewsItem[]> {
    if (!this.page) return [];

    try {
      const newsItems = await this.page.evaluate(() => {
        const items: any[] = [];
        const articles = document.querySelectorAll(
          "article, .article, .news-item"
        );

        articles.forEach((article) => {
          const titleEl = article.querySelector("h2, h3, .title");
          const linkEl = article.querySelector("a[href]");
          const descEl = article.querySelector("p, .description, .excerpt");

          if (titleEl && linkEl) {
            items.push({
              title: titleEl.textContent?.trim() || "No title",
              url: linkEl.getAttribute("href") || "",
              description: descEl?.textContent?.trim() || "",
              published_at: "",
            });
          }
        });

        return items;
      });

      const news: NewsItem[] = [];

      for (const item of newsItems.slice(0, 10)) {
        if (!item.url) continue;

        // Normalize URL
        const url = item.url.startsWith("http")
          ? item.url
          : `https://cryptonews.com${item.url}`;

        const rawNewsItem = {
          source: this.sourceName,
          url,
          title: cleanText(item.title),
          description: cleanText(item.description || ""),
          published_at: item.published_at
            ? normalizeDate(item.published_at)
            : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          category: item.category ? cleanText(item.category) : null,
          author: item.author ? cleanText(item.author) : null,
          content_type: "Article",
          full_content: item.description || "",
          preview_content: item.description
            ? cleanText(item.description)
            : null,
        };

        // Use sanitizeNewsItem
        const newsItem = sanitizeNewsItem(rawNewsItem);
        news.push(newsItem);
      }

      return news;
    } catch (error) {
      this.log(`Error extracting from mobile: ${error}`, "error");
      return [];
    }
  }

  protected async saveDebugScreenshot(name: string): Promise<void> {
    if (!this.page) return;

    const outputPath = getStructuredOutputPath("CryptoNews");
    const screenshotPath = path.join(outputPath, `${name}.png`);

    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.log(`Screenshot saved: ${screenshotPath}`);
  }
}
