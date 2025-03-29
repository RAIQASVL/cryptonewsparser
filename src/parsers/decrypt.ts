import { chromium, Page } from "playwright";
import * as path from "path";
import * as fs from "fs/promises";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  saveDebugInfo,
  getStructuredOutputPath,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { decryptConfig } from "../config/parsers/decrypt.config";

// Parser for Decrypt
export async function parseDecrypt(): Promise<NewsItem[]> {
  console.log("Starting to parse Decrypt...");
  const news: NewsItem[] = [];
  const baseUrl = "https://decrypt.co";

  const browser = await chromium.launch({
    headless: false, // For debugging
    slowMo: 50,
  });

  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    console.log("Navigating to Decrypt...");

    await page.goto("https://decrypt.co/news", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, "../../output");
    ensureDirectoryExists(outputDir);

    // Save debug information
    await saveDebugInfo(page, outputDir, "decrypt");

    console.log("Page loaded, extracting news items...");

    // Wait for news container to appear
    await page
      .waitForSelector(".posts-wrapper", { timeout: 10000 })
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
      const elements = document.querySelectorAll("article.post");

      if (!elements || elements.length === 0) {
        console.log("No news elements found");
        return items;
      }

      elements.forEach((element) => {
        // Extract data
        const titleEl = element.querySelector("h3.post__title");
        const title = titleEl?.textContent?.trim() || "";

        const descriptionEl = element.querySelector(".post__excerpt");
        const description = descriptionEl?.textContent?.trim() || "";

        const categoryEl = element.querySelector(".post__category");
        const category = categoryEl?.textContent?.trim() || null;

        const timeEl = element.querySelector("time");
        const publishedTime = timeEl?.getAttribute("datetime") || "";

        const authorEl = element.querySelector(".post__author-name");
        const author = authorEl?.textContent?.trim() || null;

        const linkEl = element.querySelector("a.post__link");
        const url = linkEl?.getAttribute("href") || "";

        // Extract image URL
        const imageEl = element.querySelector("img.post__image");
        const imageUrl = imageEl?.getAttribute("src") || null;

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

    const newsToProcess = newsItems.slice(0, 5);

    for (const item of newsToProcess) {
      try {
        const fullUrl = normalizeUrl(item.url, baseUrl);

        console.log(`Navigating to article: ${fullUrl}`);

        await page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        const articleContent = await extractDecryptArticle(page, fullUrl);

        const newsItem: NewsItem = {
          source: "decrypt",
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

        await page.waitForTimeout(2000);
      } catch (error) {
        console.error(`Error processing article ${item.url}: ${error}`);
      }
    }

    return news;
  } catch (error) {
    console.error(`Error parsing Decrypt: ${error}`);
    return news;
  } finally {
    await browser.close();
  }
}

// Function to extract full article text
async function extractDecryptArticle(page: Page, url: string): Promise<string> {
  try {
    await page
      .waitForSelector(".article__content", { timeout: 10000 })
      .catch(() => console.log("Article content not found, continuing anyway"));

    const articleContent = await page.evaluate(() => {
      const title =
        document.querySelector("h1.article__title")?.textContent?.trim() || "";

      const subtitle =
        document.querySelector(".article__excerpt")?.textContent?.trim() || "";

      const author =
        document.querySelector(".article__author-name")?.textContent?.trim() ||
        "";

      const publishedDate =
        document.querySelector("time.article__date")?.textContent?.trim() || "";

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

      // Forming full text
      let fullText = `# ${title}\n\n`;

      if (subtitle) {
        fullText += `${subtitle}\n\n`;
      }

      if (author || publishedDate) {
        fullText += `Author: ${author} | Date: ${publishedDate}\n\n`;
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

export class DecryptParser extends BaseParser {
  constructor() {
    super("Decrypt", decryptConfig);
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Navigating to ${this.config.url}`);

    try {
      // Start with the main URL for the news list
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Add a small delay for content loading
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if we are blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Extract all articles
      // For Decrypt, use a more flexible approach to finding articles
      const articles = await this.page.evaluate(() => {
        const findArticles = () => {
          // Try different selectors for finding articles
          const selectors = [
            "article",
            ".article",
            ".post",
            ".card",
            ".news-item",
            ".story",
            "[class*='article']",
            "[class*='post']",
            "[class*='card']",
            "[class*='story']",
            // Specific selectors for Decrypt
            ".article-card",
            ".news-card",
            ".story-card",
            ".post-card",
            // More general selectors
            "a[href*='/article/']",
            "a[href*='/news/']",
            "a[href*='/story/']",
            "a[href*='/post/']",
            // Containers that may contain articles
            ".articles-container > div",
            ".news-container > div",
            ".posts-container > div",
            ".stories-container > div",
            "main > div",
            ".content > div",
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              return Array.from(elements);
            }
          }

          // If nothing is found, try to find links that might be articles
          const links = Array.from(document.querySelectorAll("a[href]"));
          return links.filter((link) => {
            const href = link.getAttribute("href") || "";
            return (
              href.includes("/article/") ||
              href.includes("/news/") ||
              href.includes("/story/") ||
              href.includes("/post/")
            );
          });
        };

        const articleElements = findArticles();

        // Extract data from found elements
        return articleElements
          .map((article) => {
            // For links and articles, use different approaches
            const isLink = article.tagName.toLowerCase() === "a";

            // Extract URL
            let url = "";
            if (isLink) {
              url = article.getAttribute("href") || "";
            } else {
              const linkElement = article.querySelector("a[href]");
              url = linkElement?.getAttribute("href") || "";
            }

            // Extract title
            let title = "";
            if (isLink) {
              title = article.textContent?.trim() || "";
              // If the link text is too short, search for a heading inside
              if (title.length < 15) {
                const headingElement = article.querySelector("h1, h2, h3, h4");
                if (headingElement) {
                  title = headingElement.textContent?.trim() || "";
                }
              }
            } else {
              const titleElement = article.querySelector(
                "h1, h2, h3, h4, .title, [class*='title']"
              );
              title = titleElement?.textContent?.trim() || "";
            }

            // If the title is still not found, try other methods
            if (!title) {
              // Search for an element with a large text
              const textElements = Array.from(article.querySelectorAll("*"));
              for (const el of textElements) {
                const text = el.textContent?.trim() || "";
                if (text.length > 20 && text.length < 200) {
                  title = text;
                  break;
                }
              }
            }

            // Extract description
            let description = "";
            const descriptionElement = article.querySelector(
              "p, .description, .excerpt, [class*='description'], [class*='excerpt']"
            );
            description = descriptionElement?.textContent?.trim() || "";

            // Extract date
            let publishedTime = "";
            const dateElement = article.querySelector(
              "time, .date, [datetime], [class*='date'], [class*='time']"
            );
            publishedTime =
              dateElement?.getAttribute("datetime") ||
              dateElement?.textContent?.trim() ||
              "";

            // Extract image
            let imageUrl = null;
            const imageElement = article.querySelector("img");
            if (imageElement) {
              imageUrl =
                imageElement.getAttribute("src") ||
                imageElement.getAttribute("data-src") ||
                imageElement.getAttribute("data-lazy-src") ||
                null;
            }

            // Extract author
            let author = null;
            const authorElement = article.querySelector(
              ".author, .byline, [class*='author'], [class*='byline']"
            );
            author = authorElement?.textContent?.trim() || null;

            // Extract category
            let category = null;
            const categoryElement = article.querySelector(
              ".category, .tag, [class*='category'], [class*='tag']"
            );
            category = categoryElement?.textContent?.trim() || null;

            return {
              title: title || "No title",
              url,
              description,
              published_time: publishedTime,
              image_url: imageUrl,
              author,
              category,
            };
          })
          .filter((article) => article.url && article.title !== "No title");
      });

      this.log(`Extracted ${articles.length} articles`);

      // Filter out articles without URL or title
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
            content_type: "Article",
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

      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    try {
      this.log(`Navigating to article: ${url}`);

      if (!this.page) throw new Error("Page not initialized");

      // Go to the article page
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Extract article content
      const content = await this.page.evaluate(() => {
        // Function to find an element by multiple selectors
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

        // Search for title
        const titleSelectors = [
          "h1",
          ".article-title",
          ".post-title",
          '[class*="title"]',
        ];
        const title =
          findElement(titleSelectors)?.textContent?.trim() || "Без заголовка";

        // Search for subtitle
        const subtitleSelectors = [
          "h2",
          ".subtitle",
          ".description",
          '[class*="subtitle"]',
        ];
        const subtitle =
          findElement(subtitleSelectors)?.textContent?.trim() || "";

        // Search for author
        const authorSelectors = [
          ".author",
          ".byline",
          '[class*="author"]',
          '[class*="byline"]',
        ];
        const author = findElement(authorSelectors)?.textContent?.trim() || "";

        // Search for date
        const dateSelectors = [
          "time",
          ".date",
          "[datetime]",
          '[class*="date"]',
        ];
        const date = findElement(dateSelectors)?.textContent?.trim() || "";

        // Specific selectors for Decrypt content
        const contentSelectors = [
          ".article-content p",
          ".post-content p",
          ".entry-content p",
          "article p",
          ".content p",
          "main p",
          // More specific for Decrypt
          '[class*="article"] p',
          '[class*="content"] p',
          // If paragraphs are not found, try to find the entire container
          ".article-content",
          ".post-content",
          ".entry-content",
          "article",
          ".content",
        ];

        // Get all paragraphs
        let paragraphs = findAllElements(contentSelectors.slice(0, 7)); // First try to find paragraphs

        // If paragraphs are not found, try to find the entire container
        if (paragraphs.length === 0) {
          const container = findElement(contentSelectors.slice(7));
          if (container) {
            paragraphs = Array.from(container.querySelectorAll("p"));
            if (paragraphs.length === 0) {
              // If paragraphs are still not found, use the entire container
              paragraphs = [container];
            }
          }
        }

        // Form the full text
        let fullText = `# ${title}\n\n`;
        if (subtitle) fullText += `${subtitle}\n\n`;
        if (author || date)
          fullText += `Author: ${author || "N/A"} | Date: ${date || "N/A"}\n\n`;

        // Add paragraphs
        if (paragraphs.length > 0) {
          paragraphs.forEach((p) => {
            const text = p.textContent?.trim() || "";
            if (text) fullText += `${text}\n\n`;
          });
        } else {
          fullText += "Failed to extract article content.\n\n";
        }

        // Search for tags
        const tagSelectors = [
          ".tags a",
          '[class*="tag"] a',
          'a[href*="tag"]',
          ".topics a",
          ".categories a",
        ];
        const tags = findAllElements(tagSelectors)
          .map((tag) => tag.textContent?.trim())
          .filter(Boolean);

        if (tags.length > 0) {
          fullText += `Tags: ${tags.join(", ")}\n`;
        }

        return fullText;
      });

      return content;
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return `⚠️ Error extracting article content: ${error}`;
    }
  }

  private async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.log("Using alternative method to extract news", "info");

    try {
      // Try using RSS feed
      await this.page?.goto("https://decrypt.co/feed", {
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
              // Navigate to article page to extract full content
              const fullContent = await this.extractArticleContent(item.url);

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
                full_content: fullContent || item.description,
                preview_content: item.description,
              };

              const newsItem = sanitizeNewsItem(rawNewsItem);
              news.push(newsItem);

              // Add a small delay between requests
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 + Math.random() * 1000)
              );
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
        "https://www.google.com/search?q=site:decrypt.co+crypto+news&tbm=nws",
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

      // Extract search results and process them
      // ... (existing code for search results)

      // Add a return statement at the end to fix the error
      return [];
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
      return [];
    }
  }

  protected async saveResults(news: NewsItem[]) {
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
      await fs.writeFile(outputFile, JSON.stringify(news, null, 2), "utf8");

      this.log(`Results saved to ${outputFile}`);

      // Also save to the latest file
      const latestFile = path.join(
        "output",
        `${this.sourceName.toLowerCase()}.json`
      );
      await fs.writeFile(latestFile, JSON.stringify(news, null, 2), "utf8");
    } catch (error) {
      this.log(`Error saving results: ${error}`, "error");
    }
  }

  protected async simulateHumanBehavior() {
    if (!this.page) return;

    try {
      // Simulate scrolling
      await this.page.evaluate(() => {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const scrollSteps = Math.floor(scrollHeight / viewportHeight);

        let currentPosition = 0;

        for (let i = 0; i <= scrollSteps; i++) {
          currentPosition = i * viewportHeight;
          window.scrollTo(0, currentPosition);
        }

        // Scroll back up
        for (let i = scrollSteps; i >= 0; i--) {
          currentPosition = i * viewportHeight;
          window.scrollTo(0, currentPosition);
        }
      });

      // Add random pauses
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000)
      );
    } catch (error) {
      this.log(`Error simulating human behavior: ${error}`, "error");
    }
  }
}
