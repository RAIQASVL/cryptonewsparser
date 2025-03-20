import { NewsItem } from "../types/news";
import { cleanText, normalizeUrl, normalizeDate } from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { beInCryptoConfig } from "../config/parsers/beInCrypto.config";

export class BeInCryptoParser extends BaseParser {
  constructor() {
    super("BeInCrypto", beInCryptoConfig);
  }

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
      this.log(`Error during human behavior simulation: ${error}`, "warn");
    }
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");
    const news: NewsItem[] = [];

    try {
      this.log(`Navigating to ${this.config.url}...`);

      await this.page.goto(this.config.url, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Check if we're blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(`Access blocked: ${blockCheck.reason}`, "warn");
        return this.extractNewsItemsAlternative();
      }

      // Find news items using a more reliable approach
      const newsItems = await this.page.evaluate(() => {
        // Target the news cards that have titles and links
        const cards = Array.from(
          document.querySelectorAll(
            '[data-el="bic-c-news-big"], article.news-card, .multi-news-card'
          )
        );

        return cards
          .map((card) => {
            // Extract link and title
            const linkElement = card.querySelector("a[href]");
            const titleElement = card.querySelector("h5, .title a, .s2, .s1");

            // Extract image
            const imageElement = card.querySelector("img");

            // Extract category
            const categoryElement = card.querySelector(
              ".flex a:first-child, .cat a"
            );

            // Extract content type
            const contentTypeElement = card.querySelector(".tpw_style1, .tpw");

            // Extract time
            const timeElement = card.querySelector("time, .ago");

            // Extract reading time
            const readingTimeElement = card.querySelector(
              '.inline-flex.items-center span, [data-el="reading-time"]'
            );

            return {
              url: linkElement ? linkElement.getAttribute("href") : null,
              title: titleElement ? titleElement.textContent?.trim() : null,
              image_url: imageElement
                ? imageElement.getAttribute("src") ||
                  imageElement.getAttribute("data-src")
                : null,
              category: categoryElement
                ? categoryElement.textContent?.trim()
                : null,
              content_type: contentTypeElement
                ? contentTypeElement.textContent?.trim()
                : null,
              published_time: timeElement
                ? timeElement.textContent?.trim() ||
                  timeElement.getAttribute("datetime")
                : null,
              reading_time: readingTimeElement
                ? readingTimeElement.textContent?.trim()
                : null,
              description: "", // Will be filled when visiting the article
              is_video: false, // Default value
              author: null, // Will be filled when visiting the article
            };
          })
          .filter((item) => item.url && item.title); // Filter out items without URL or title
      });

      this.log(`Found ${newsItems.length} news items`, "info");

      // Process the first 10 items
      for (const item of newsItems.slice(0, 10)) {
        try {
          // Create the newsItem object
          const newsItem: NewsItem = {
            source: this.sourceName,
            url: normalizeUrl(item.url || "", this.baseUrl),
            title: cleanText(item.title || ""),
            description: cleanText(item.description || ""),
            published_at: item.published_time
              ? normalizeDate(item.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: item.category ? cleanText(item.category) : null,
            image_url: item.image_url,
            author: item.author ? cleanText(item.author) : null,
            tags: [],
            content_type: item.is_video ? "Video" : "Article",
            reading_time: item.reading_time || null,
            views: null,
            full_content: await this.extractArticleContent(
              normalizeUrl(item.url || "", this.baseUrl || "")
            ),
          };

          // Push the newsItem to the news array
          news.push(newsItem);
        } catch (error) {
          this.log(`Error processing news item: ${error}`, "error");
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.log(`Error extracting news items: ${error}`, "error");
      return news;
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    try {
      const page = await this.browser?.newPage();
      if (!page) throw new Error("Browser page not initialized");

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait for the content to load
      await page.waitForSelector(".entry-content", { timeout: 10000 });

      // Extract the article content
      const content = await page.evaluate(() => {
        // Get the main content container
        const contentElement = document.querySelector(".entry-content-inner");
        if (!contentElement) return "";

        // Extract brief summary if available
        let briefContent = "";
        const briefBlock = document.querySelector(".in-brief-block");
        if (briefBlock) {
          const briefPoints = Array.from(
            briefBlock.querySelectorAll(".in-brief-block__row")
          );
          if (briefPoints.length > 0) {
            briefContent =
              "In Brief:\n" +
              briefPoints
                .map((p) => "• " + p.textContent?.trim())
                .filter(Boolean)
                .join("\n") +
              "\n\n";
          }
        }

        // Get all content elements: paragraphs, headings, blockquotes
        const contentElements = Array.from(
          contentElement.querySelectorAll(
            "p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol"
          )
        );

        // Filter out ads and sponsored content
        const filteredElements = contentElements.filter((el) => {
          const classes = el.className || "";
          const parent = el.parentElement;
          const parentClasses = parent ? parent.className || "" : "";

          return (
            !classes.includes("ad-wrapper") &&
            !classes.includes("sponsored") &&
            !parentClasses.includes("ad-wrapper") &&
            !parentClasses.includes("sponsored") &&
            !el.closest('[data-speechify_ignore="true"]') &&
            !el.closest("[el-auto-block]")
          );
        });

        // Join the text content
        const mainContent = filteredElements
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .join("\n\n");

        return briefContent + mainContent;
      });

      await page.close();
      return content || "";
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return "";
    }
  }

  // Alternative method to extract news (through RSS or other sources)
  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.log("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      const rssUrls = [
        "https://beincrypto.com/feed/",
        "https://beincrypto.com/news/feed/",
        "https://beincrypto.com/rss",
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

          const newsItem: NewsItem = {
            source: this.sourceName,
            url,
            title,
            description,
            published_at: publishedAt,
            fetched_at: new Date().toISOString(),
            category: categories.length > 0 ? categories[0] : null,
            tags: categories,
            image_url: imageUrl,
            author,
            content_type: "Article",
            reading_time: null,
            views: null,
            full_content: fullContent || description,
          };

          news.push(newsItem);
        }
      }
    } catch (error) {
      this.log(`Error parsing RSS feed: ${error}`, "error");
    }

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

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      // Check for blocking messages
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
      this.log(`Error checking for blockers: ${error}`, "error");
      return { blocked: false, reason: "" };
    }
  }
}
