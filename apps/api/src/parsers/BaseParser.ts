import { chromium, Page, Browser, BrowserContext } from "playwright-core";
import { NewsItem } from "@cryptonewsparser/shared/dist/types/news";
import * as path from "path";
import * as fs from "fs/promises";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  getStructuredOutputPath,
} from "../utils/parser-utils";
import { Logger, logger as defaultLogger } from "../utils/logger";
import { ParserOptions } from "../utils/parser-factory";

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
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected baseUrl: string;
  protected config: ParserConfig;
  protected sourceName: string;
  protected logger: Logger;
  protected headless: boolean;
  protected ownsBrowser: boolean = false;

  constructor(
    sourceName: string,
    config: ParserConfig,
    options: ParserOptions = {}
  ) {
    this.sourceName = sourceName;
    this.config = config;
    this.baseUrl = new URL(config.url).origin;
    this.logger = options.logger || defaultLogger;
    this.headless = options.headless ?? true;

    if (options.browser) {
      this.browser = options.browser;
      this.ownsBrowser = false;
      this.logger.debug(`Using shared browser instance`, this.sourceName);
    } else {
      this.ownsBrowser = true;
      this.logger.debug(
        `Will create and manage its own browser instance`,
        this.sourceName
      );
    }
  }

  protected logMessage(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info"
  ): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.sourceName}]`;

    switch (level) {
      case "info":
        this.logger.info(message, this.sourceName);
        break;
      case "warn":
        this.logger.warn(message, this.sourceName);
        break;
      case "error":
        this.logger.error(message, this.sourceName);
        break;
      case "debug":
        this.logger.debug(message, this.sourceName);
        break;
    }
  }

  protected async init(): Promise<void> {
    if (this.page) {
      this.logMessage("Parser already initialized.", "warn");
      return;
    }

    try {
      if (this.ownsBrowser && !this.browser) {
        this.logMessage(
          `Creating new browser instance (headless: ${this.headless})`
        );
        this.browser = await chromium.launch({
          headless: this.headless,
          slowMo: process.env.NODE_ENV === "development" ? 50 : undefined,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } else if (!this.browser) {
        throw new Error("Browser instance was expected but not found.");
      }

      this.logMessage("Creating new browser context");
      this.context = await this.browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
        javaScriptEnabled: true,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
      });

      this.logMessage("Configuring resource blocking");
      await this.context.route(
        "**/*.{png,jpg,jpeg,gif,webp,svg,ico,ttf,woff,woff2,eot}",
        (route) => route.abort()
      );
      await this.context.route("**/*.css", (route) => route.abort());
      await this.context.route("**/analytics.js", (route) => route.abort());
      await this.context.route("**/gtm.js", (route) => route.abort());
      await this.context.route("**/fbevents.js", (route) => route.abort());
      await this.context.route("**/ga.js", (route) => route.abort());
      await this.context.route("**/adsense.js", (route) => route.abort());
      await this.context.route("**/adsbygoogle.js", (route) => route.abort());
      await this.context.route("**/doubleclick.net/**", (route) =>
        route.abort()
      );
      await this.context.route("**/facebook.net/**", (route) => route.abort());
      await this.context.route("**/google-analytics.com/**", (route) =>
        route.abort()
      );

      this.logMessage("Opening new page");
      this.page = await this.context.newPage();
      await this.setUserAgent();
      this.logMessage("Initialization complete");
    } catch (error) {
      this.logMessage(
        `Initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      await this.closeBrowser();
      throw error;
    }
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
      this.logMessage(`Starting to parse ${this.sourceName}...`);
      const items = await this.extractNewsItems();
      this.logMessage(
        `Finished parsing ${this.sourceName}, found ${items.length} items`
      );
      return items;
    } catch (error) {
      this.logMessage(
        `Error parsing ${this.sourceName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      return [];
    } finally {
      await this.closeBrowser();
    }
  }

  protected async closeBrowser(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
        this.logMessage("Page closed", "debug");
      } catch (e) {
        this.logMessage(`Error closing page: ${e}`, "warn");
      }
      this.page = null;
    }
    if (this.context) {
      try {
        await this.context.close();
        this.logMessage("Browser context closed", "debug");
      } catch (e) {
        this.logMessage(`Error closing context: ${e}`, "warn");
      }
      this.context = null;
    }
    if (this.browser && this.ownsBrowser) {
      try {
        await this.browser.close();
        this.logMessage("Owned browser instance closed");
      } catch (e) {
        this.logMessage(`Error closing browser: ${e}`, "warn");
      }
    }
    this.browser = null;
  }

  protected async randomDelay(minMs = 500, maxMs = 1500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    this.logMessage(`Waiting for ${delay}ms...`, "debug");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      return await this.page.evaluate(() => {
        const hasCaptcha = !!(
          document.querySelector('[class*="captcha"]') ||
          document.querySelector('[id*="captcha"]') ||
          document.querySelector('iframe[src*="captcha"]')
        );

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

        const hasNoContent =
          document.querySelectorAll('article, .article, a[href*="/"]')
            .length === 0;

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
      this.logMessage(`Error checking for blockers: ${error}`, "error");
      return { blocked: true, reason: `Error: ${error}` };
    }
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.logMessage(`Navigating to ${this.config.url}...`);

      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      const isBlocked = await this.checkForBlockers();
      if (isBlocked.blocked) {
        this.logMessage(
          `Сайт блокирует автоматизацию, пропускаем парсинг. Причина: ${isBlocked.reason}`,
          "warn"
        );
        return [];
      }

      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => this.logMessage("News container not found", "warn"));

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

      this.logMessage(`Found ${newsItems.length} news items`);

      const news: NewsItem[] = [];

      const newsToProcess = newsItems.slice(0, 10);

      this.logMessage(
        `Processing details for ${newsToProcess.length} items...`
      );
      for (const [index, itemData] of newsToProcess.entries()) {
        const itemUrl = normalizeUrl(itemData.url, this.baseUrl);
        this.logMessage(
          `[${index + 1}/${
            newsToProcess.length
          }] Processing article: ${itemUrl}`
        );
        try {
          const newsItem: NewsItem = {
            source: this.sourceName,
            url: itemUrl,
            title: cleanText(itemData.title),
            description: cleanText(itemData.description),
            published_at: itemData.published_time
              ? normalizeDate(itemData.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: itemData.category ? cleanText(itemData.category) : null,
            author: itemData.author ? cleanText(itemData.author) : null,
            content_type: "Article",
            full_content: await this.extractArticleContent(itemUrl),
          };

          news.push(newsItem);

          await this.randomDelay();
        } catch (error) {
          this.logMessage(
            `Error processing article ${itemUrl}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error"
          );
        }
      }

      this.logMessage(
        `Successfully processed ${news.length} items with full content.`
      );
      await this.saveResults(news);
      return news;
    } catch (error) {
      this.logMessage(
        `Error extracting news items: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );

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
        this.logMessage(`Error screenshot saved: ${errorScreenshotPath}`);
      }

      return [];
    }
  }

  protected abstract extractArticleContent(url: string): Promise<string>;

  protected async saveResults(newsItems: NewsItem[]): Promise<void> {
    if (newsItems.length === 0) {
      this.logMessage("No results to save.", "warn");
      return;
    }

    try {
      const outputPath = getStructuredOutputPath(this.sourceName);
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "");
      const outputFile = path.join(
        outputPath,
        `${this.sourceName.toLowerCase()}_${timestamp}.json`
      );

      await fs.writeFile(
        outputFile,
        JSON.stringify(newsItems, null, 2),
        "utf8"
      );

      this.logMessage(`Results saved to ${outputFile}`);

      const latestFileDir = path.resolve(__dirname, "..", "..", "output");
      await ensureDirectoryExists(latestFileDir);
      const latestFile = path.join(
        latestFileDir,
        `${this.sourceName.toLowerCase()}.json`
      );
      await fs.writeFile(
        latestFile,
        JSON.stringify(newsItems, null, 2),
        "utf8"
      );
      this.logMessage(`Updated latest results file: ${latestFile}`);
    } catch (error) {
      this.logMessage(
        `Error saving results: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
    }
  }
}
