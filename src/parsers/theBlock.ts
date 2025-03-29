import { chromium, Page, Browser } from "playwright";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  getStructuredOutputPath,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { theBlockConfig } from "../config/parsers/theBlock.config";

export async function parseTheBlock(
  options: { headless?: boolean } = {}
): Promise<NewsItem[]> {
  console.log("Starting to parse The Block...");
  const news: NewsItem[] = [];
  const baseUrl = "https://www.theblock.co";

  const browser = await chromium.launch({
    headless: options.headless !== undefined ? options.headless : true,
    slowMo: 50,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio",
      "--disable-infobars",
      "--window-size=1920,1080",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Add anti-detection script
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      (window as any).chrome = { runtime: {} };
    });

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    console.log("Navigating to The Block...");

    await page.goto("https://www.theblock.co/latest", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Create output directory if it doesn't exist
    const outputPath = getStructuredOutputPath("TheBlock");

    console.log("Page loaded, extracting news items...");

    // Wait for news container to appear
    await page
      .waitForSelector(".post-card", { timeout: 10000 })
      .catch(() =>
        console.log("News container not found, trying to continue anyway")
      );

    // Extract news items
    const newsItems = await page.evaluate(() => {
      const items: Array<{
        title: string;
        description: string;
        category: string | null;
        published_time: string;
        author: string | null;
        url: string;
        image_url: string | null;
      }> = [];

      // Find all news elements
      const elements = document.querySelectorAll(".post-card");

      if (!elements || elements.length === 0) {
        console.log("No news elements found");
        return items;
      }

      elements.forEach((element) => {
        // Extract data
        const titleEl = element.querySelector(".post-card__title");
        const title = titleEl?.textContent?.trim() || "";

        const descriptionEl = element.querySelector(".post-card__excerpt");
        const description = descriptionEl?.textContent?.trim() || "";

        const categoryEl = element.querySelector(".post-card__category");
        const category = categoryEl?.textContent?.trim() || null;

        const timeEl = element.querySelector(".post-card__date");
        const publishedTime = timeEl?.textContent?.trim() || "";

        const authorEl = element.querySelector(".post-card__author");
        const author = authorEl?.textContent?.trim() || null;

        const linkEl = element.querySelector("a.post-card__link");
        const url = linkEl?.getAttribute("href") || "";

        // Extract image URL
        const imageEl = element.querySelector("img.post-card__image");
        const imageUrl = imageEl?.getAttribute("src") || null;

        // Add news item to list
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
    });

    console.log(`Found ${newsItems.length} news items on the page`);

    // Process first 5 news items (for testing)
    const newsToProcess = newsItems.slice(0, 5);

    for (const item of newsToProcess) {
      try {
        // Form full URL for article
        const fullUrl = normalizeUrl(item.url, baseUrl);

        console.log(`Navigating to article: ${fullUrl}`);

        // Go to article page
        await page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Extract full article content
        const articleContent = await extractTheBlockArticle(page, fullUrl);

        // Create news item object
        const newsItem: NewsItem = {
          source: "theblock",
          url: fullUrl,
          title: item.title,
          description: item.description,
          published_at: normalizeDate(item.published_time),
          fetched_at: new Date().toISOString(),
          category: item.category,
          author: item.author,
          content_type: "News",
          full_content: articleContent,
        };

        news.push(newsItem);

        // Make a pause between requests
        await page.waitForTimeout(2000);
      } catch (error) {
        console.error(`Error processing article ${item.url}: ${error}`);
      }
    }

    return news;
  } catch (error) {
    console.error(`Error parsing The Block: ${error}`);
    return news;
  } finally {
    await browser.close();
  }
}

// Function to extract full article text
async function extractTheBlockArticle(
  page: Page,
  url: string
): Promise<string> {
  try {
    // Wait for article content to load
    await page
      .waitForSelector(".article__content", { timeout: 10000 })
      .catch(() => console.log("Article content not found, continuing anyway"));

    // Extract article content
    const articleContent = await page.evaluate(() => {
      // Extract title
      const title =
        document.querySelector("h1.article__title")?.textContent?.trim() || "";

      // Extract subtitle
      const subtitle =
        document.querySelector(".article__excerpt")?.textContent?.trim() || "";

      // Extract author
      const author =
        document.querySelector(".article__author-name")?.textContent?.trim() ||
        "";

      // Extract published date
      const publishedDate =
        document.querySelector(".article__date")?.textContent?.trim() || "";

      // Extract tags
      const tags = Array.from(
        document.querySelectorAll(".article__tags a") || []
      )
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join(", ");

      // Extract main content
      const contentElements = Array.from(
        document.querySelectorAll(
          ".article__content p, .article__content h2, .article__content h3, .article__content ul, .article__content ol"
        ) || []
      );

      // Form full text
      let fullText = `# ${title}\n\n`;

      if (subtitle) {
        fullText += `${subtitle}\n\n`;
      }

      if (author || publishedDate) {
        fullText += `Автор: ${author} | Дата: ${publishedDate}\n\n`;
      }

      // Add main content
      contentElements.forEach((element) => {
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim() || "";

        if (!text) return;

        if (tagName === "h2") {
          fullText += `## ${text}\n\n`;
        } else if (tagName === "h3") {
          fullText += `### ${text}\n\n`;
        } else if (tagName === "ul" || tagName === "ol") {
          // For lists, process each item separately
          const listItems = Array.from(element.querySelectorAll("li") || [])
            .map((li) => `- ${li.textContent?.trim()}`)
            .join("\n");
          fullText += `${listItems}\n\n`;
        } else {
          fullText += `${text}\n\n`;
        }
      });

      if (tags) {
        fullText += `Tags: ${tags}\n`;
      }

      return fullText;
    });

    return articleContent;
  } catch (error) {
    console.error(`Error extracting article content: ${error}`);
    return `⚠️ Error extracting article content: ${error}`;
  }
}

export class TheBlockParser extends BaseParser {
  constructor() {
    super("TheBlock", theBlockConfig);
  }

  protected async init(
    options: { headless?: boolean; browser?: Browser } = {}
  ) {
    // Use provided browser or create a new one
    if (options.browser) {
      this.browser = options.browser;
      this.log("Using shared browser instance");
    } else {
      this.browser = await chromium.launch({
        headless: options.headless !== undefined ? options.headless : true,
        slowMo: 50,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--hide-scrollbars",
          "--mute-audio",
          "--disable-infobars",
          "--window-size=1920,1080",
        ],
      });
      this.log("Created new browser instance");
    }

    // Create context with additional parameters
    const context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      hasTouch: false,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation: { longitude: -73.935242, latitude: 40.73061 }, // New York
      permissions: ["geolocation"],
    });

    // Set cookies to simulate a real user
    await context.addCookies([
      {
        name: "visited_before",
        value: "true",
        domain: ".theblock.co",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: true,
        sameSite: "None",
      },
      {
        name: "consent",
        value: "true",
        domain: ".theblock.co",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: true,
        sameSite: "None",
      },
    ]);

    this.page = await context.newPage();

    // Override navigator properties to bypass automation detection
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

    // Block trackers and analytics
    await this.page.route(
      "**/(google-analytics|gtm|facebook|doubleclick|analytics).*.(js|php)",
      (route) => route.abort()
    );

    // Add random mouse movements to simulate human behavior
    await this.simulateHumanBehavior();
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Navigating to ${this.config.url}`);

    try {
      // Add random delay before loading page
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000)
      );

      // Start with the main URL for the news list
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior: scrolling the page
      await this.simulateHumanBehavior();

      // Add a small delay for content loading
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 + Math.random() * 1000)
      );

      // Check if we are blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(
          `Access to the site is blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );

        // Try to extract any data from the current page
        const emergencyData = await this.extractEmergencyData();
        if (emergencyData.length > 0) {
          this.log(
            `Successfully extracted ${emergencyData.length} items in emergency mode`,
            "info"
          );
          await this.saveResults(emergencyData);
          return emergencyData;
        }

        // If we couldn't extract data from the current page, try alternative approach
        return await this.extractNewsItemsAlternative();
      }

      // Extract all articles
      const articles = await this.page.$$eval("article", (articles) => {
        return articles.map((article) => {
          // Extract title
          const titleElement = article.querySelector("h2, h3, .title");
          const title = titleElement?.textContent?.trim() || "No title";

          // Extract link
          const linkElement = article.querySelector("a[href]");
          const url = linkElement?.getAttribute("href") || "";

          // Extract description
          const descriptionElement = article.querySelector(
            "p, .description, .excerpt"
          );
          const description = descriptionElement?.textContent?.trim() || "";

          // Extract date
          const dateElement = article.querySelector("time, .date, [datetime]");
          const publishedTime =
            dateElement?.getAttribute("datetime") ||
            dateElement?.textContent?.trim() ||
            "";

          // Extract image
          const imageElement = article.querySelector("img");
          const imageUrl = imageElement?.getAttribute("src") || null;

          // Extract author
          const authorElement = article.querySelector(".author, .byline");
          const author = authorElement?.textContent?.trim() || null;

          // Extract category
          const categoryElement = article.querySelector(".category, .tag");
          const category = categoryElement?.textContent?.trim() || null;

          return {
            title,
            url,
            description,
            published_time: publishedTime,
            image_url: imageUrl,
            author,
            category,
          };
        });
      });

      this.log(`Extracted ${articles.length} articles`);

      // Filter articles without URL or title
      const validArticles = articles.filter(
        (article) => article.url && article.title !== "No title"
      );

      this.log(`Found ${validArticles.length} valid articles`);

      // Limit the number of articles to process
      const articlesToProcess = validArticles.slice(0, 10);

      // Process extracted articles
      const news: NewsItem[] = [];

      for (const article of articlesToProcess) {
        try {
          const fullUrl = normalizeUrl(article.url, this.baseUrl);

          this.log(`Processing article: ${fullUrl}`);

          const rawNewsItem = {
            source: this.sourceName,
            url: fullUrl,
            title: cleanText(article.title),
            description: cleanText(article.description || ""),
            published_at: article.published_time
              ? normalizeDate(article.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: article.category ? cleanText(article.category) : null,
            author: article.author ? cleanText(article.author) : null,
            content_type: "News",
            full_content: await this.extractArticleContent(fullUrl),
            preview_content: article.description
              ? cleanText(article.description)
              : null,
          };

          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);

          // Add a small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          this.log(
            `Error processing article ${article.url}: ${error}`,
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

      // Try to extract some data in case of an error
      try {
        if (this.page) {
          const emergencyData = await this.extractEmergencyData();
          if (emergencyData.length > 0) {
            this.log(
              `Successfully extracted ${emergencyData.length} items in emergency mode`,
              "info"
            );
            await this.saveResults(emergencyData);
            return emergencyData;
          }
        }
      } catch (emergencyError) {
        this.log(`Error in emergency extraction: ${emergencyError}`, "error");
      }

      return [];
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
      await this.randomDelay(1000, 2000);

      // Move mouse to random positions
      const viewportSize = await this.page.viewportSize();
      if (viewportSize) {
        const { width, height } = viewportSize;
        for (let i = 0; i < 3; i++) {
          const x = Math.floor(Math.random() * width);
          const y = Math.floor(Math.random() * height);
          await this.page.mouse.move(x, y);
          await this.randomDelay(500, 1000);
        }
      }
    } catch (error) {
      this.log(`Error during human behavior simulation: ${error}`, "warn");
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

        // Check if there is any content on the page
        const hasNoContent =
          document.querySelectorAll('article, .article, a[href*="/"]')
            .length === 0;

        // Check if there are any signs of an empty page
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
      return { blocked: true, reason: `Error: ${error}` }; // In case of an error, assume there is a block
    }
  }

  private async extractEmergencyData(): Promise<NewsItem[]> {
    if (!this.page) return [];

    try {
      // Try to extract any links and texts that might be news
      const emergencyItems = await this.page.evaluate(() => {
        const items: Array<{ title: string; url: string; text: string }> = [];

        // Find all links on the page
        const links = Array.from(document.querySelectorAll("a[href]"));

        links.forEach((link) => {
          const href = link.getAttribute("href") || "";
          // Filter only links that might be news
          if (
            href.includes("/post/") ||
            href.includes("/news/") ||
            href.includes("/article/")
          ) {
            const title = link.textContent?.trim() || "";
            if (title && title.length > 20) {
              // Assume the title should be long enough
              // Find the nearest text block
              const parent = link.closest("div, article, section");
              const text = parent?.textContent?.trim() || "";

              items.push({
                title,
                url: href,
                text,
              });
            }
          }
        });

        return items;
      });

      // Convert extracted data to NewsItem format
      const news: NewsItem[] = [];

      for (const item of emergencyItems) {
        const fullUrl = normalizeUrl(item.url, this.baseUrl);

        const rawNewsItem = {
          source: this.sourceName,
          url: fullUrl,
          title: cleanText(item.title),
          description: cleanText(item.text.substring(0, 200) + "..."),
          published_at: new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          category: null,
          image_url: null,
          author: null,
          content_type: "News",
          full_content: `# ${item.title}\n\n${item.text}\n\n(Extracted in emergency mode due to blocking)`,
          preview_content: item.text
            ? cleanText(item.text.substring(0, 200) + "...")
            : null,
        };

        const newsItem = sanitizeNewsItem(rawNewsItem);
        news.push(newsItem);
      }

      return news;
    } catch (error) {
      this.log(`Error in emergency data extraction: ${error}`, "error");
      return [];
    }
  }

  private async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    // Alternative method for extracting news via API or RSS
    this.log("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      await this.page?.goto("https://www.theblock.co/rss", {
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
                content_type: "News",
                full_content: item.description || "",
                preview_content: item.description
                  ? cleanText(item.description)
                  : null,
              };

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

      // If RSS didn't work, try using Google to search for news
      this.log("RSS unavailable, trying search via Google", "info");

      await this.page?.goto(
        "https://www.google.com/search?q=site:theblock.co+crypto+news&tbm=nws",
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

      // Extract search results
      const searchResults = await this.page?.evaluate(() => {
        const results = Array.from(document.querySelectorAll(".g"));
        return results.map((result) => {
          const titleElement = result.querySelector("h3");
          const linkElement = result.querySelector("a");
          const snippetElement = result.querySelector(".st");

          return {
            title: titleElement?.textContent || "No title",
            url: linkElement?.getAttribute("href") || "",
            description: snippetElement?.textContent || "",
            published_time: "",
            author: null,
            category: null,
          };
        });
      });

      if (searchResults && searchResults.length > 0) {
        // Process search results
        const news: NewsItem[] = [];

        for (const item of searchResults.slice(0, 10)) {
          try {
            if (!item.url.includes("theblock.co")) continue;

            const rawNewsItem = {
              source: this.sourceName,
              url: item.url,
              title: cleanText(item.title),
              description: cleanText(item.description || ""),
              published_at: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              category: null,
              image_url: null,
              author: null,
              content_type: "News",
              full_content:
                item.description || "Content unavailable due to blocking",
              preview_content: item.description
                ? cleanText(item.description)
                : null,
            };

            const newsItem = sanitizeNewsItem(rawNewsItem);
            news.push(newsItem);
          } catch (error) {
            this.log(`Error processing search result: ${error}`, "error");
          }
        }

        await this.saveResults(news);
        return news;
      }

      // If nothing worked, return empty array
      this.log("Failed to extract news using alternative methods", "error");
      return [];
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    try {
      this.log(`Navigating to article: ${url}`);

      if (!this.page) throw new Error("Page not initialized");

      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await this.simulateHumanBehavior();

      const content = await this.page.evaluate(() => {
        const findElement = (selectors: string[]): Element | null => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
          }
          return null;
        };

        const findAllElements = (selectors: string[]): Element[] => {
          const elements: Element[] = [];
          for (const selector of selectors) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
              elements.push(...Array.from(found));
            }
          }
          return elements;
        };

        const title =
          findElement(["h1", ".article-title"])?.textContent?.trim() ||
          "No title";
        const paragraphs = findAllElements([
          ".article-content p",
          "article p",
          ".post-content p",
        ]);

        let fullText = `# ${title}\n\n`;

        if (paragraphs.length > 0) {
          paragraphs.forEach((p) => {
            const text = p.textContent?.trim() || "";
            if (text) fullText += `${text}\n\n`;
          });
        } else {
          const mainContent = findElement([
            ".article-content",
            "article",
            ".post-content",
          ]);
          if (mainContent) {
            fullText += `${mainContent.textContent?.trim()}\n\n`;
          } else {
            fullText += "Failed to extract article content.\n\n";
          }
        }

        return fullText;
      });

      return content;
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return `⚠️ Error extracting article content: ${error}`;
    }
  }
}
