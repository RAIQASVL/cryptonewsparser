import { NewsItem } from "@cryptonewsparser/shared";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser, ParserConfig } from "./BaseParser";
import { bitcoinMagazineConfig } from "../config/parsers/bitcoinMagazine.config";
import { ParserOptions } from "../utils/parser-factory";

// Parser for Bitcoin Magazine
export class BitcoinMagazineParser extends BaseParser {
  constructor(options: ParserOptions) {
    super("bitcoinmagazine", bitcoinMagazineConfig, options);
    this.logMessage("BitcoinMagazineParser initialized");
  }

  // Method for simulating human behavior
  private async simulateHumanBehavior(): Promise<void> {
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

      // Sometimes click on a random element and go back
      if (Math.random() > 0.7) {
        const links = await this.page.$$("a:not([href^='javascript'])");
        if (links.length > 0) {
          const randomLink = links[Math.floor(Math.random() * links.length)];
          await randomLink.click();
          await this.page.waitForTimeout(
            Math.floor(Math.random() * 1000) + 1000
          );
          await this.page.goBack();
          await this.page.waitForTimeout(Math.floor(Math.random() * 500) + 500);
        }
      }
    } catch (error) {
      this.logMessage(
        `Error during human behavior simulation: ${error}`,
        "warn"
      );
    }
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      this.logMessage(`Navigating to ${this.config.url}...`);

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
        this.logMessage(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Wait for news container
      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => this.logMessage("News container not found", "warn"));

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
        }> = [];

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

            // Add item if it has required fields
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
          } catch (error) {
            console.error(`Error processing news item: ${error}`);
          }
        });

        return items;
      }, this.config.selectors);

      this.logMessage(`Found ${newsItems.length} news items`);

      // Process each news item
      const news: NewsItem[] = [];
      const itemsToProcess = newsItems.slice(0, 10); // Process up to 10 items

      // Counter for consecutive blocks
      let consecutiveBlockCount = 0;
      const MAX_CONSECUTIVE_BLOCKS = 3; // Maximum number of consecutive blocks

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

          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);

          // Add random delay between requests
          await this.randomDelay(3000, 7000); // Increase delay
        } catch (error) {
          this.logMessage(`Error processing news item: ${error}`, "error");
          consecutiveBlockCount++;
        }

        // Check block counter after each article
        if (consecutiveBlockCount >= MAX_CONSECUTIVE_BLOCKS) {
          this.logMessage(
            `Consecutive block limit reached (${MAX_CONSECUTIVE_BLOCKS}). Stopping parsing.`,
            "error"
          );
          break;
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.logMessage(`Error extracting news items: ${error}`, "error");
      return [];
    }
  }

  protected async randomDelay(
    min: number = 1000,
    max: number = 3000
  ): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      const blockCheck = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();

        // Check for access error messages
        const has403 =
          bodyText.includes("403") ||
          bodyText.includes("forbidden") ||
          bodyText.includes("access denied");

        const hasCloudflare =
          bodyText.includes("cloudflare") &&
          (bodyText.includes("security check") ||
            bodyText.includes("challenge"));

        const hasCaptcha =
          bodyText.includes("captcha") ||
          bodyText.includes("robot") ||
          bodyText.includes("human verification");

        // Check for captcha elements
        const captchaElements = document.querySelectorAll(
          "[class*='captcha'], [id*='captcha'], iframe[src*='captcha']"
        );

        if (has403)
          return { blocked: true, reason: "Block message detected: 403" };
        if (hasCloudflare)
          return { blocked: true, reason: "Cloudflare protection detected" };
        if (hasCaptcha || captchaElements.length > 0)
          return { blocked: true, reason: "Captcha detected" };

        return { blocked: false, reason: "" };
      });

      return blockCheck;
    } catch (error) {
      this.logMessage(`Error checking for blockers: ${error}`, "error");
      return { blocked: false, reason: "" };
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page)
      throw new Error("Page not initialized for extractArticleContent");

    try {
      this.logMessage(`Extracting content from: ${url}`, "info");

      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await this.simulateHumanBehavior();

      // Check for blockers
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.logMessage(`Article access blocked: ${blockCheck.reason}`, "warn");
        return `⚠️ Article access blocked: ${blockCheck.reason}`;
      }

      // Try multiple selectors for content
      const contentSelectors = [
        this.config.articleSelectors.content,
        ".tdb_single_content",
        ".td-post-content",
        ".wpb_wrapper",
        "article",
        ".post-content",
      ];

      let contentFound = false;
      for (const selector of contentSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          this.logMessage(`Found content with selector: ${selector}`, "info");
          contentFound = true;
          break;
        } catch (error) {
          this.logMessage(
            `Content selector ${selector} not found, trying next...`,
            "warn"
          );
        }
      }

      if (!contentFound) {
        this.logMessage("Article content not found with any selector", "warn");
        return "⚠️ Article content not found";
      }

      // Extract article content
      return this.page.evaluate((selectors) => {
        // Function to safely get text content of an element
        const safeText = (selector: string): string => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || "";
        };

        // Function to safely get an array of text content
        const safeTextArray = (selector: string): string[] => {
          return Array.from(document.querySelectorAll(selector))
            .map((el) => el.textContent?.trim())
            .filter(Boolean) as string[];
        };

        // Extract main metadata
        const title =
          safeText(selectors.title) ||
          safeText("h1.entry-title") ||
          document.title;

        const subtitle =
          safeText(selectors.subtitle || "") || safeText(".td-post-sub-title");

        const author =
          safeText(selectors.author || "") ||
          safeText(".td-post-author-name a") ||
          safeText(".tdb-author-by + .tdb-author-name");

        const date =
          safeText(selectors.date || "") || safeText(".entry-date.updated");

        const categories = safeTextArray(selectors.category || "").join(", ");

        const tags = safeTextArray(selectors.tags || "").join(", ");

        // Define content selector
        const contentSelector = document.querySelector(selectors.content)
          ? selectors.content
          : document.querySelector(".td-post-content")
          ? ".td-post-content"
          : ".wpb_wrapper";

        // Extract content elements
        const contentElements = Array.from(
          document.querySelectorAll(
            `${contentSelector} p, ${contentSelector} h2, ${contentSelector} h3, ${contentSelector} ul, ${contentSelector} ol, ${contentSelector} blockquote`
          )
        );

        // Form full text
        let fullText = `# ${title}\n\n`;

        if (subtitle) {
          fullText += `${subtitle}\n\n`;
        }

        if (author || date) {
          fullText += `Author: ${author || "N/A"} | Date: ${date || "N/A"}\n\n`;
        }

        if (categories) {
          fullText += `Categories: ${categories}\n\n`;
        }

        // Process content elements
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
            case "blockquote":
              fullText += `> ${text}\n\n`;
              break;
            case "ul":
            case "ol":
              const items = Array.from(element.querySelectorAll("li"))
                .map((li) => `- ${li.textContent?.trim()}`)
                .filter(Boolean)
                .join("\n");
              fullText += `${items}\n\n`;
              break;
            default:
              fullText += `${text}\n\n`;
          }
        });

        // Add tags at the end
        if (tags) {
          fullText += `Tags: ${tags}\n`;
        }

        return fullText;
      }, this.config.articleSelectors);
    } catch (error) {
      this.logMessage(
        `Error extracting article content: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      return `⚠️ Error extracting article content: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  // Alternative method for extracting news (through RSS or other sources)
  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.logMessage("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      const rssUrl = "https://bitcoinmagazine.com/.rss/full/";
      await this.page?.goto(rssUrl, { timeout: 30000 });

      const rssContent = await this.page?.content();

      if (
        rssContent &&
        rssContent.includes("<rss") &&
        rssContent.includes("<item>")
      ) {
        return this.parseRssFeed(rssContent);
      }

      this.logMessage("RSS feed not available, trying other methods", "warn");
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
      // Use more reliable approach with regular expressions
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
            content_type: "Article",
            full_content: fullContent || description,
            preview_content: description,
          };

          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);
        }
      }
    } catch (error) {
      this.logMessage(`Error parsing RSS feed: ${error}`, "error");
    }

    return news;
  }

  // Helper method for cleaning HTML tags
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
}
