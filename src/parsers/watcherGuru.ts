import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  getStructuredOutputPath,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser, ParserConfig } from "./BaseParser";
import { watcherGuruConfig } from "../config/parsers/watcherGuru.config";
import * as path from "path";
import * as fs from "fs";
import { chromium, Browser } from "playwright";

export class WatcherGuruParser extends BaseParser {
  private userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
  ];

  constructor() {
    super("WatcherGuru", watcherGuruConfig);
  }

  protected async init(
    options: { headless?: boolean; browser?: Browser } = {}
  ) {
    // Use provided browser or create a new one
    if (options.browser) {
      this.browser = options.browser;
      this.log("Using shared browser instance");
    } else {
      // Use enhanced settings to bypass blocks
      this.browser = await chromium.launch({
        headless: options.headless !== undefined ? options.headless : true,
        slowMo: 50,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-site-isolation-trials",
          "--disable-web-security",
          "--disable-features=BlockInsecurePrivateNetworkRequests",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--ignore-certificate-errors",
          "--disable-extensions",
          "--disable-default-apps",
          "--window-size=1920,1080",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--hide-scrollbars",
          "--mute-audio",
          "--disable-infobars",
        ],
      });
      this.log("Created new browser instance");
    }

    // Create context with enhanced settings
    const context = await this.browser.newContext({
      userAgent: this.getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: true,
      bypassCSP: true,
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        DNT: "1",
        Referer: "https://www.google.com/",
      },
      ignoreHTTPSErrors: true,
      permissions: ["geolocation"],
    });

    this.page = await context.newPage();
    this.page.setDefaultTimeout(30000);

    // Add anti-detection scripts
    await this.page.addInitScript(() => {
      // Overwrite the 'webdriver' property to prevent detection
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Overwrite the plugins to use a normal looking set
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Overwrite the languages property
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Use type assertion for chrome
      (window as any).chrome = { runtime: {} };

      // Add a fake notification permission
      if (window.Notification) {
        const originalQuery = window.Notification.requestPermission;
        window.Notification.requestPermission = function () {
          return Promise.resolve("granted");
        };
      }

      // Modify navigator properties
      Object.defineProperty(navigator, "maxTouchPoints", {
        get: () => 1,
      });

      // Add fake screen properties
      Object.defineProperty(screen, "colorDepth", { get: () => 24 });
      Object.defineProperty(screen, "pixelDepth", { get: () => 24 });
    });

    // Intercept requests to modify headers
    await this.page.route("**", async (route) => {
      const request = route.request();
      // Skip resource requests
      if (
        request.resourceType() === "image" ||
        request.resourceType() === "stylesheet" ||
        request.resourceType() === "font"
      ) {
        await route.continue();
        return;
      }

      // Modify headers for other requests
      await route.continue({
        headers: {
          ...request.headers(),
          "User-Agent": this.getRandomUserAgent(),
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.google.com/",
        },
      });
    });
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Navigating to ${this.config.url}...`);
    const news: NewsItem[] = [];

    try {
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Check if we're blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(`Access blocked: ${blockCheck.reason}`);
        this.log("Extracting news items using alternative method", "info");
        return this.extractNewsItemsAlternative();
      }

      // Wait for news container to load
      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => {
          this.log(
            "News container not found, trying alternative method",
            "warn"
          );
          return this.extractNewsItemsAlternative();
        });

      // Extract news items
      const newsItems = await this.page.evaluate((selectors) => {
        const items: Array<{
          title: string;
          description: string;
          category: string | null;
          published_time: string;
          author: string | null;
          url: string;
          image_url: string | null;
          content_type: string | null;
        }> = [];

        // Get all news elements
        const elements = document.querySelectorAll(selectors.newsItem);
        if (!elements || elements.length === 0) {
          console.error("No news items found");
          return items;
        }

        elements.forEach((element) => {
          try {
            // Get title
            const titleElement = element.querySelector(selectors.title);
            const title = titleElement?.textContent?.trim() || "";

            // Get description
            const descriptionElement = element.querySelector(
              selectors.description || ""
            );
            const description =
              descriptionElement?.textContent?.trim() || title;

            // Get category
            const categoryElement = element.querySelector(
              selectors.category || ""
            );
            const category = categoryElement?.textContent?.trim() || null;

            // Get publication date
            const dateElement = element.querySelector(selectors.date || "");
            const published_time = dateElement?.textContent?.trim() || "";

            // Get author
            const authorElement = element.querySelector(selectors.author || "");
            const author = authorElement?.textContent?.trim() || null;

            // Get URL
            const linkElement = element.querySelector(selectors.link);
            const url = linkElement?.getAttribute("href") || "";

            // Get image URL
            const imageElement = element.querySelector(selectors.image || "");
            const image_url = imageElement?.getAttribute("src") || null;

            // Get content type
            const contentTypeElement = element.querySelector(
              selectors.contentType || ""
            );
            const content_type =
              contentTypeElement?.textContent?.trim() || null;

            if (title && url) {
              items.push({
                title,
                description,
                category,
                published_time,
                author,
                url,
                image_url,
                content_type,
              });
            }
          } catch (error) {
            console.error("Error extracting news item:", error);
          }
        });

        return items;
      }, this.config.selectors);

      // Process extracted news items
      for (const item of newsItems) {
        try {
          const rawNewsItem = {
            source: this.sourceName,
            url: normalizeUrl(item.url, this.config.url),
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
              normalizeUrl(item.url, this.config.url)
            ),
            preview_content: item.description
              ? cleanText(item.description)
              : null,
          };

          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);
        } catch (error) {
          this.log(`Error processing news item: ${error}`, "error");
        }
      }

      return news;
    } catch (error) {
      this.log(`Error extracting news items: ${error}`, "error");
      return this.extractNewsItemsAlternative();
    }
  }

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");
    const news: NewsItem[] = [];

    try {
      this.log("Using alternative method to extract news", "info");

      // Try to access WatcherGuru directly with different approach
      this.log(
        "Trying to access WatcherGuru directly with different approach",
        "info"
      );

      // List of URLs to try
      const urlsToTry = [
        "https://watcher.guru/news/",
        "https://watcher.guru/news/altcoins",
        "https://watcher.guru/news/bitcoin",
        "https://watcher.guru/news/ethereum",
        "https://watcher.guru/news/defi",
      ];

      for (const url of urlsToTry) {
        try {
          // Use a different approach to request the page
          await this.page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          // Check if the page loaded successfully
          const isBlocked = await this.isAccessBlocked();
          if (isBlocked) {
            this.log(`Access to ${url} is blocked, trying next URL`, "info");
            continue;
          }

          this.log(`Successfully accessed ${url}`, "info");

          // Extract articles from the page
          const articles = await this.extractArticlesFromPage();
          if (articles.length > 0) {
            news.push(...articles);
            this.log(`Found ${articles.length} articles on ${url}`, "info");
            break; // If we found articles, stop trying URLs
          }
        } catch (error) {
          this.log(`Error accessing ${url}: ${error}`, "error");
        }
      }

      // If we couldn't get news directly, try specific articles
      if (news.length === 0) {
        this.log("Trying to access specific articles directly", "info");

        // List of known articles to check
        const knownArticles = [
          "https://watcher.guru/news/hedera-hbar-how-high-will-it-trade-in-2025",
          "https://watcher.guru/news/us-dollar-drops-4-7-in-2025-whats-next-for-your-portfolio",
          "https://watcher.guru/news/jpmorgan-says-meta-stock-will-lead-this-key-market-amid-exconomic-uncertainty",
          "https://watcher.guru/news/walmart-wmt-debuts-new-ai-assistant-stock-eyes-40-upside",
        ];

        for (const articleUrl of knownArticles) {
          try {
            await this.page.goto(articleUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

            const isBlocked = await this.isAccessBlocked();
            if (isBlocked) {
              this.log(
                `Access to ${articleUrl} is blocked, trying next article`,
                "info"
              );
              continue;
            }

            this.log(`Successfully accessed ${articleUrl}`, "info");

            // Extract article data
            const article = await this.extractArticleData(articleUrl);
            if (article) {
              news.push(article);
              this.log(
                `Successfully extracted article: ${article.title}`,
                "info"
              );
            }
          } catch (error) {
            this.log(`Error accessing ${articleUrl}: ${error}`, "error");
          }
        }
      }

      return news;
    } catch (error) {
      this.log(`Error in alternative extraction methods: ${error}`, "error");
      return [];
    }
  }

  private async extractArticlesFromPage(): Promise<NewsItem[]> {
    const articles: NewsItem[] = [];

    try {
      // Extract article cards
      const cards = await this.page?.$$(".article-card");
      if (!cards) return articles;

      for (const card of cards) {
        try {
          // Extract title
          const title = await card.$eval(
            "h2.entry-title a",
            (el) => el.textContent?.trim() || ""
          );

          // Extract URL
          const url = await card.$eval(
            "h2.entry-title a",
            (el) => el.getAttribute("href") || ""
          );

          // Extract date
          const dateStr = await card.$eval(
            ".entry-date",
            (el) => el.textContent?.trim() || ""
          );

          // Extract author
          const author = await card
            .$eval(".author-name", (el) => el.textContent?.trim() || "")
            .catch(() => null);

          // Extract category
          const category = await card
            .$eval(".cat-links a", (el) => el.textContent?.trim() || "Crypto")
            .catch(() => "Crypto");

          // Extract image
          const imageUrl = await card
            .$eval(".post-thumbnail img", (el) => el.getAttribute("src") || "")
            .catch(() => null);

          const newsItem: NewsItem = {
            title: title,
            url: url,
            published_at: dateStr
              ? new Date(dateStr).toISOString()
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            description: title.trim(),
            author: author || null,
            source: this.sourceName,
            category: category || "Crypto",
            content_type: "Article",
            full_content: null,
          };

          articles.push(newsItem);
        } catch (error) {
          this.log(
            `Error extracting article data from card: ${error}`,
            "error"
          );
        }
      }
    } catch (error) {
      this.log(`Error extracting articles from page: ${error}`, "error");
    }

    return articles;
  }

  private async extractArticleData(url: string): Promise<NewsItem | null> {
    try {
      if (!this.page) return null;

      const articleSelectors = this.config.articleSelectors;

      // Extract title using configured selectors
      const title = await this.page
        .$eval(
          articleSelectors.title || "h2.wp-block-heading, h1.entry-title",
          (el) => el.textContent?.trim() || ""
        )
        .catch(async () => {
          // Fallback to first heading if configured selector not found
          return (
            this.page?.$eval("h1, h2", (el) => el.textContent?.trim() || "") ||
            ""
          );
        });

      // Extract date using configured selectors
      const dateStr = await this.page
        .$eval(
          articleSelectors.date || "time.entry-date, .entry-date",
          (el) => el.textContent?.trim() || ""
        )
        .catch(() => new Date().toISOString());

      // Extract author using configured selectors
      const author = await this.page
        .$eval(
          articleSelectors.author || ".author-name, .author a",
          (el) => el.textContent?.trim() || ""
        )
        .catch(() => "WatcherGuru");

      // Extract category using configured selectors
      const category = await this.page
        .$eval(
          articleSelectors.category || ".cat-links a, .category a",
          (el) => el.textContent?.trim() || "Crypto"
        )
        .catch(() => "Crypto");

      // Extract image using configured selectors
      const imageUrl = await this.page
        .$eval(
          articleSelectors.image || ".post-thumbnail img, .entry-content img",
          (el) => el.getAttribute("src") || ""
        )
        .catch(() => null);

      // Extract full article content using configured selectors
      const fullContent = await this.page
        .$eval(articleSelectors.content || ".entry-content", (el) => {
          // Remove ad blocks and scripts
          const adElements = el.querySelectorAll<HTMLElement>(
            ".quads-location, script, .add, [class*='publift-ad'], [class*='sevioads']"
          );
          adElements.forEach((ad: HTMLElement) => ad.remove());

          return el.innerHTML.trim();
        })
        .catch(() => null);

      // Extract description from first paragraph
      const description = await this.page
        .$eval(
          articleSelectors.paragraphs || ".entry-content p:first-of-type",
          (el) => el.textContent?.trim() || ""
        )
        .catch(() => title);

      if (title) {
        const rawNewsItem = {
          title: title,
          url: url,
          published_at:
            typeof dateStr === "string" && dateStr
              ? new Date(dateStr).toISOString()
              : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          description: description,
          author: author,
          source: this.sourceName,
          category: category,
          content_type: "Article",
          full_content: fullContent,
        };

        const newsItem = sanitizeNewsItem(rawNewsItem);

        return newsItem;
      }

      return null;
    } catch (error) {
      this.log(`Error extracting article data: ${error}`, "error");
      return null;
    }
  }

  private async isAccessBlocked(): Promise<boolean> {
    if (!this.page) return true;

    try {
      // Check for block messages
      const blockMessage = await this.page.evaluate(() => {
        // Check for 403 code
        if (
          document.body.textContent?.includes("403") ||
          document.body.textContent?.includes("Forbidden") ||
          document.body.textContent?.includes("Access Denied")
        ) {
          return "403";
        }

        // Check for captcha
        if (
          document.body.textContent?.includes("captcha") ||
          document.querySelector("form#captcha-form") !== null ||
          document.querySelector("div.g-recaptcha") !== null
        ) {
          return "captcha";
        }

        // Check if page loaded correctly
        if (
          !document.querySelector("article.post") &&
          !document.querySelector(".entry-content") &&
          !document.querySelector("h1.entry-title")
        ) {
          return "no_content";
        }

        return null;
      });

      if (blockMessage) {
        this.log(
          `Access blocked: Block message detected: ${blockMessage}`,
          "info"
        );
        return true;
      }

      return false;
    } catch (error) {
      this.log(`Error checking if access is blocked: ${error}`, "error");
      return true; // If there's an error, assume we're blocked
    }
  }

  private saveResultsToJson(news: NewsItem[]): void {
    try {
      // Use the structured output path
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
      fs.writeFileSync(outputFile, JSON.stringify(news, null, 2), "utf8");

      // Also save to the latest file
      const latestFile = path.join(
        "output",
        `${this.sourceName.toLowerCase()}.json`
      );
      fs.writeFileSync(latestFile, JSON.stringify(news, null, 2), "utf8");

      this.log(`Results saved to ${outputFile}`, "info");
    } catch (error) {
      this.log(`Error saving results to JSON: ${error}`, "error");
    }
  }

  private async enrichNewsWithFullContent(
    news: NewsItem[]
  ): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log("Enriching news items with full content...", "info");

    // Process only the first 3 articles to save time
    const itemsToEnrich = news.slice(0, 3);

    for (const item of itemsToEnrich) {
      try {
        this.log(`Fetching full content for: ${item.title}`, "info");

        // Use our new extractArticleContent method to get clean text
        const fullContent = await this.extractArticleContent(item.url);

        if (fullContent) {
          item.full_content = fullContent;
          this.log(
            `Successfully extracted full content for: ${item.title}`,
            "info"
          );
        }

        await this.randomDelay();
      } catch (error) {
        this.log(
          `Error fetching full content for ${item.title}: ${error}`,
          "error"
        );
      }
    }

    return news;
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      // Navigate to the article page
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Check if we're blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(`Access to article blocked: ${blockCheck.reason}`, "warn");
        return `Access to article blocked: ${blockCheck.reason}`;
      }

      // Extract just the text content from the article
      const content = await this.page.evaluate(() => {
        // Get the article content container
        const contentContainer = document.querySelector(".entry-content");
        if (!contentContainer) return "";

        // Function to extract text from an element and its children
        function extractTextContent(element: Element): string {
          let text = "";

          // Process all child nodes
          for (const node of Array.from(element.childNodes)) {
            // Text node - add its content
            if (node.nodeType === Node.TEXT_NODE) {
              const nodeText = node.textContent?.trim() || "";
              if (nodeText) text += nodeText + " ";
            }
            // Element node - process based on tag
            else if (
              node.nodeType === Node.ELEMENT_NODE &&
              node instanceof Element
            ) {
              // Skip unwanted elements
              if (
                node.tagName === "SCRIPT" ||
                node.tagName === "STYLE" ||
                node.tagName === "IFRAME" ||
                node.classList?.contains("ad") ||
                node.classList?.contains("advertisement") ||
                node.classList?.contains("quads-location") ||
                node.classList?.contains("social-share") ||
                node.classList?.contains("related-posts") ||
                node.classList?.contains("sharedaddy") ||
                node.classList?.contains("jp-relatedposts")
              ) {
                continue;
              }

              // Add newlines before headings
              if (
                node.tagName === "H1" ||
                node.tagName === "H2" ||
                node.tagName === "H3" ||
                node.tagName === "H4"
              ) {
                text += "\n\n" + (node.textContent?.trim() || "") + "\n\n";
              }
              // Handle paragraphs
              else if (node.tagName === "P") {
                text += (node.textContent?.trim() || "") + "\n\n";
              }
              // Handle lists
              else if (node.tagName === "UL" || node.tagName === "OL") {
                const items = Array.from(node.querySelectorAll("li"));
                for (const item of items) {
                  text += "• " + (item.textContent?.trim() || "") + "\n";
                }
                text += "\n";
              }
              // Recursively process other elements
              else {
                text += extractTextContent(node);
              }
            }
          }

          return text;
        }

        // Extract text from the content container
        return extractTextContent(contentContainer).trim();
      });

      return content;
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return "";
    }
  }

  public async parse(
    options: { headless?: boolean; browser?: Browser } = {}
  ): Promise<NewsItem[]> {
    this.log("Starting to parse WatcherGuru...");

    try {
      await this.init(options);
      let news = await this.extractNewsItems();

      // Enrich news with full content
      if (news.length > 0) {
        news = await this.enrichNewsWithFullContent(news);
      }

      // Save results to JSON file
      this.saveResultsToJson(news);

      this.log(`Finished parsing WatcherGuru, found ${news.length} items`);
      return news;
    } catch (error) {
      this.log(`Error parsing WatcherGuru: ${error}`, "error");
      return [];
    } finally {
      await this.cleanup();
    }
  }

  private async simulateHumanBehavior(): Promise<void> {
    if (!this.page) return;

    try {
      // Scroll down slowly
      await this.page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= document.body.scrollHeight / 2) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // Random delay
      await this.randomDelay();

      // Move mouse to random positions
      const viewportSize = await this.page.viewportSize();
      if (viewportSize) {
        const { width, height } = viewportSize;
        for (let i = 0; i < 3; i++) {
          const x = Math.floor(Math.random() * width);
          const y = Math.floor(Math.random() * height);
          await this.page.mouse.move(x, y);
          await this.randomDelay();
        }
      }
    } catch (error) {
      this.log(`Error during human behavior simulation: ${error}`, "warn");
    }
  }

  // Make this method protected to match the base class
  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      // Check for common block indicators
      const isBlocked = await this.page.evaluate(() => {
        // Check for 403/forbidden messages
        if (
          document.body.textContent?.includes("403") ||
          document.body.textContent?.includes("Forbidden") ||
          document.body.textContent?.includes("Access Denied") ||
          document.body.textContent?.includes("Blocked")
        ) {
          return { blocked: true, reason: "403 Forbidden" };
        }

        // Check for captcha
        if (
          document.body.textContent?.includes("captcha") ||
          document.querySelector("form#captcha-form") !== null ||
          document.querySelector("div.g-recaptcha") !== null
        ) {
          return { blocked: true, reason: "Captcha detected" };
        }

        // Check for cloudflare protection
        if (
          document.body.textContent?.includes("Checking your browser") ||
          document.body.textContent?.includes("DDoS protection") ||
          document.body.textContent?.includes("Cloudflare")
        ) {
          return { blocked: true, reason: "Cloudflare protection" };
        }

        // Check if content loaded correctly
        if (
          !document.querySelector("article.post") &&
          !document.querySelector(".entry-content") &&
          !document.querySelector("h1.entry-title")
        ) {
          return { blocked: true, reason: "Content not loaded" };
        }

        return { blocked: false, reason: "" };
      });

      return isBlocked;
    } catch (error) {
      this.log(`Error checking for blockers: ${error}`, "error");
      return { blocked: true, reason: `Error: ${error}` };
    }
  }

  protected async randomDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 3000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
