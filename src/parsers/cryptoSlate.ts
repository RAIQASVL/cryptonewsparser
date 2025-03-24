import { NewsItem } from "../types/news";
import { cleanText, normalizeUrl, normalizeDate} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { cryptoSlateConfig } from "../config/parsers/cryptoSlate.config";

export class CryptoSlateParser extends BaseParser {
  constructor() {
    super("CryptoSlate", cryptoSlateConfig);
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Navigating to ${this.config.url}`);
    const news: NewsItem[] = [];

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

      // Wait for news container
      await this.page
        .waitForSelector(this.config.selectors.newsContainer, {
          timeout: 10000,
        })
        .catch(() => this.log("News container not found", "warn"));

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

      this.log(`Found ${newsItems.length} news items`);

      // Process each news item
      const news: NewsItem[] = [];
      const itemsToProcess = newsItems.slice(0, 10); // Process up to 10 items

      for (const item of itemsToProcess) {
        try {
          // Create news item
          const newsItem: NewsItem = {
            source: this.sourceName,
            url: normalizeUrl(item.url, this.baseUrl),
            title: cleanText(item.title),
            description: cleanText(item.description || ""),
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
            full_content: null,
          };

          // Extract full content
          newsItem.full_content = await this.extractArticleContent(item.url);
          news.push(newsItem);

          // Add random delay between requests
          await this.randomDelay(3000);
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

      // Add a small wait for content to load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Extract article content with a maximally flexible approach
      const content = await this.page.evaluate(() => {
        // Function to find element by multiple selectors
        const findElement = (selectors: string[]): Element | null => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
          }
          return null;
        };

        // Function to find all elements by multiple selectors
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

        // Extract title and content
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

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");
    const news: NewsItem[] = [];

    try {
      this.log("Using alternative method to extract news", "info");

      // Try using RSS feed (as in BitcoinMagazine)
      const rssUrls = [
        "https://cryptoslate.com/feed/",
        "https://cryptoslate.com/news/feed/",
        "https://cryptoslate.com/rss",
        "https://cryptoslate.com/feed/atom/",
      ];

      for (const rssUrl of rssUrls) {
        this.log(`Trying RSS feed: ${rssUrl}`, "info");

        try {
          await this.page.goto(rssUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });

          const rssContent = await this.page.content();

          if (
            rssContent &&
            (rssContent.includes("<rss") ||
              rssContent.includes("<feed") ||
              rssContent.includes("<channel"))
          ) {
            this.log("RSS feed found, parsing items", "info");
            const rssItems = await this.parseRssFeed(rssContent);

            if (rssItems.length > 0) {
              this.log(`Found ${rssItems.length} items in RSS feed`, "info");

              // For the first 3-5 articles, extract full content
              const itemsWithContent = [];
              for (let i = 0; i < Math.min(rssItems.length, 3); i++) {
                try {
                  const item = rssItems[i];
                  const fullContent = await this.extractArticleContent(
                    item.url
                  );
                  item.full_content = fullContent;
                  itemsWithContent.push(item);
                  await this.randomDelay();
                } catch (error) {
                  this.log(
                    `Error extracting content for RSS item: ${error}`,
                    "warn"
                  );
                  itemsWithContent.push(rssItems[i]);
                }
              }

              // Add remaining articles without full content
              return [...itemsWithContent, ...rssItems.slice(3)];
            }
          }
        } catch (error) {
          this.log(`Error accessing RSS feed ${rssUrl}: ${error}`, "warn");
        }
      }

      // If RSS didn't work, try using Google search
      this.log("RSS feeds not available, trying Google search", "info");

      try {
        await this.page.goto(
          "https://www.google.com/search?q=site:cryptoslate.com+crypto+news",
          {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          }
        );

        // Simulate human behavior
        await this.simulateHumanBehavior();

        // Extract search results
        const searchResults = await this.page.evaluate(() => {
          const results = Array.from(
            document.querySelectorAll("a[href*='cryptoslate.com']")
          );
          return results
            .filter((a) => {
              const href = a.getAttribute("href") || "";
              return (
                href.includes("cryptoslate.com") &&
                !href.includes("google") &&
                !href.includes("search")
              );
            })
            .map((a) => {
              const url = new URL(a.getAttribute("href") || "").href;
              const titleElement = a.querySelector("h3") || a;
              const title = titleElement.textContent?.trim() || "No title";

              // Search for description
              let description = "";
              let parent = a.parentElement;
              for (let i = 0; i < 3 && parent; i++) {
                const descEl = parent.querySelector("div:not(:has(a))");
                if (descEl && descEl.textContent) {
                  description = descEl.textContent.trim();
                  break;
                }
                parent = parent.parentElement;
              }

              return { url, title, description };
            })
            .slice(0, 10); // Limit the number of results
        });

        if (searchResults && searchResults.length > 0) {
          this.log(
            `Found ${searchResults.length} results from Google search`,
            "info"
          );

          for (const result of searchResults) {
            const newsItem: NewsItem = {
              title: cleanText(result.title),
              description: cleanText(result.description),
              url: result.url,
              source: this.sourceName,
              published_at: new Date().toISOString(), // We don't know the exact date
              fetched_at: new Date().toISOString(),
              category: "Crypto",
              tags: ["Crypto"],
              image_url: null,
              author: null,
              content_type: "Article",
              reading_time: null,
              views: null,
              full_content: null,
            };

            news.push(newsItem);
          }

          await this.saveResults(news);
          return news;
        }
      } catch (error) {
        this.log(`Error using Google search: ${error}`, "warn");
      }

      // If nothing worked, try using Twitter
      this.log("Trying to find recent content via Twitter", "info");
      try {
        await this.page.goto("https://twitter.com/CryptoSlate", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        await this.simulateHumanBehavior();

        // Here you can add code to extract links from tweets
        // ...
      } catch (error) {
        this.log(`Error using Twitter: ${error}`, "warn");
      }

      this.log("No alternative methods worked, returning empty array", "warn");
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
    }

    return news;
  }

  // Improved human behavior simulation (as in BitcoinMagazine)
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

  // Improved blocker check
  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      // Check for access error messages
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

  // Method for random delay
  protected async randomDelay(minDelay: number = 1000): Promise<void> {
    const delay = minDelay + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, delay));
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
}
