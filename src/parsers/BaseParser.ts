import { chromium, Page, Browser } from "playwright";
import { NewsItem } from "../types/news";
import * as path from "path";
import * as fs from "fs/promises";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  getStructuredOutputPath,
} from "../utils/parser-utils";

export interface ParserConfig {
  selectors: {
    newsContainer: string;
    newsItem: string;
    title: string;
    description?: string;
    category?: string;
    author?: string;
    date?: string;
    link: string;
    image?: string;
    videoIndicator?: string;
    videoDuration?: string;
    contentType?: string;
  };
  url: string;
  articleSelectors: {
    content: string;
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
    tags?: string;
    category?: string;
    readingTime?: string;
    updated?: string;
    paywall?: string;
    cryptoInfo?: string;
    image?: string;
    paragraphs?: string;
    imageCaption?: string;
    headers?: string;
    lists?: string;
    listItems?: string;
    blockquotes?: string;
    embeddedTweets?: string;
    imagesInContent?: string;
    imageCaptionsInContent?: string;
    relatedLinks?: string;
    shareButtons?: string;
  };
}

export abstract class BaseParser {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected baseUrl: string;
  protected config: ParserConfig;
  protected sourceName: string;

  constructor(sourceName: string, config: ParserConfig) {
    this.sourceName = sourceName;
    this.config = config;
    this.baseUrl = new URL(config.url).origin;
  }

  protected async init() {
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 50,
    });

    // Create context with resource blocking
    const context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
    });

    // Block unnecessary resources for faster loading
    await context.route("**/*.{png,jpg,jpeg,gif,webp,svg,ico}", (route) => {
      if (Math.random() > 0.5) {
        // Load only part of images for realism
        return route.abort();
      }
      return route.continue();
    });

    await context.route("**/analytics.js", (route) => route.abort());
    await context.route("**/gtm.js", (route) => route.abort());
    await context.route("**/fbevents.js", (route) => route.abort());

    this.page = await context.newPage();
    await this.setUserAgent();
  }

  protected async setUserAgent() {
    await this.page?.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
    });
  }

  async parse(): Promise<NewsItem[]> {
    try {
      await this.init();
      this.log(`Starting to parse ${this.sourceName}...`);
      const items = await this.extractNewsItems();
      this.log(
        `Finished parsing ${this.sourceName}, found ${items.length} items`
      );
      return items;
    } catch (error) {
      this.log(
        `Error parsing ${this.sourceName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      return [];
    } finally {
      await this.cleanup();
    }
  }

  protected async cleanup() {
    await this.browser?.close();
  }

  protected async randomDelay(min = 2000, max = 5000) {
    const delay = Math.floor(min + Math.random() * (max - min));
    this.log(`Waiting ${delay}ms before next request...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected log(message: string, type: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.sourceName}]`;

    switch (type) {
      case "warn":
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case "error":
        console.error(`${prefix} ❌ ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️ ${message}`);
    }
  }

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      // Check for elements that may indicate blocking
      return await this.page.evaluate(() => {
        // Check for captcha
        const hasCaptcha = !!(
          document.querySelector('[class*="captcha"]') ||
          document.querySelector('[id*="captcha"]') ||
          document.querySelector('iframe[src*="captcha"]')
        );

        // Check for blocking messages
        const blockMessages = [
          "access denied",
          "blocked",
          "403",
          "not available",
          "sorry, you have been blocked",
          "security check",
          "suspicious activity",
          "too many requests",
          "rate limit",
        ];

        let blockReason = "";
        const hasBlockMessage = blockMessages.some((msg) => {
          if (document.body.textContent?.toLowerCase().includes(msg)) {
            blockReason = msg;
            return true;
          }
          return false;
        });

        // Check if there's any content on the page
        const hasNoContent =
          document.querySelectorAll('article, .article, a[href*="/"]')
            .length === 0;

        // Check for signs of an empty page
        const hasEmptyPage =
          document.body.textContent?.trim().length === 0 ||
          document.body.innerHTML.trim().length < 1000;

        return {
          blocked:
            hasCaptcha || hasBlockMessage || hasNoContent || hasEmptyPage,
          reason: hasCaptcha
            ? "Captcha detected"
            : hasBlockMessage
            ? `Block message detected: ${blockReason}`
            : hasNoContent
            ? "No content found"
            : hasEmptyPage
            ? "Empty page detected"
            : "Unknown",
        };
      });
    } catch (error) {
      this.log(`Error checking for blockers: ${error}`, "error");
      return { blocked: true, reason: `Error: ${error}` }; // Assume blocking in case of error
    }
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.log(`Navigating to ${this.config.url}...`);

      // Try loading page with more reliable parameters
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded", // More reliable option
        timeout: 60000,
      });

      // Check for blocking
      const isBlocked = await this.checkForBlockers();
      if (isBlocked.blocked) {
        this.log(
          `Сайт блокирует автоматизацию, пропускаем парсинг. Причина: ${isBlocked.reason}`,
          "warn"
        );
        return [];
      }

      // Wait for news container to appear
      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => this.log("News container not found", "warn"));

      // Extract news
      const newsItems = await this.page.evaluate((selectors) => {
        const items: Array<{
          title: string;
          description: string;
          category: string | null;
          published_time: string;
          author: string | null;
          url: string;
          image_url: string | null;
        }> = [];

        const elements = document.querySelectorAll(selectors.newsItem || "");

        elements.forEach((element) => {
          const title =
            element.querySelector(selectors.title || "")?.textContent?.trim() ||
            "";
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
              ?.textContent?.trim() as string) || "";
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
              ?.getAttribute("src") as string) || null;

          if (title && url) {
            items.push({
              title,
              description,
              category,
              published_time: publishedTime,
              author,
              url,
              image_url: imageUrl,
            });
          }
        });

        return items;
      }, this.config.selectors);

      this.log(`Found ${newsItems.length} news items`);

      // Convert to NewsItem format and process full content
      const news: NewsItem[] = [];

      // Limit the number of news to process
      const newsToProcess = newsItems.slice(0, 10); // Process only the first 10 news

      for (const item of newsToProcess) {
        try {
          const newsItem: NewsItem = {
            source: this.sourceName,
            url: normalizeUrl(item.url, this.baseUrl),
            title: cleanText(item.title),
            description: cleanText(item.description),
            published_at: item.published_time
              ? normalizeDate(item.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: item.category ? cleanText(item.category) : null,
            image_url: item.image_url
              ? normalizeUrl(item.image_url, this.baseUrl)
              : null,
            author: item.author ? cleanText(item.author) : null,
            tags: [],
            content_type: "Article",
            reading_time: null,
            views: null,
            full_content: await this.extractArticleContent(
              normalizeUrl(item.url, this.baseUrl)
            ),
          };

          news.push(newsItem);

          // Add random delay between requests
          await this.randomDelay();
        } catch (error) {
          this.log(
            `Error processing article ${item.url}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error"
          );
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.log(
        `Error extracting news items: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );

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
      }

      return [];
    }
  }

  protected abstract extractArticleContent(url: string): Promise<string>;

  protected async saveResults(newsItems: NewsItem[]): Promise<void> {
    try {
      // Get structured output path
      const outputPath = getStructuredOutputPath(this.sourceName);

      // Create filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "");
      const outputFile = path.join(
        outputPath,
        `${this.sourceName.toLowerCase()}_${timestamp}.json`
      );

      // Save the results
      await fs.writeFile(
        outputFile,
        JSON.stringify(newsItems, null, 2),
        "utf8"
      );

      console.log(`Results saved to ${outputFile}`);

      // Optionally, create a symlink or copy to the latest file
      const latestFile = path.join(
        "output",
        `${this.sourceName.toLowerCase()}.json`
      );
      await fs.writeFile(
        latestFile,
        JSON.stringify(newsItems, null, 2),
        "utf8"
      );
    } catch (error) {
      console.error("Error saving results:", error);
    }
  }
}
