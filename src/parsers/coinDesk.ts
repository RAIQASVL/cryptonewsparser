import { chromium, Page } from "playwright";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  saveDebugInfo,
  getStructuredOutputPath,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
import { coinDeskConfig } from "../config/parsers/coinDesk.config";

export async function parseCoinDesk(): Promise<NewsItem[]> {
  console.log("Starting to parse CoinDesk...");
  const news: NewsItem[] = [];
  const baseUrl = "https://www.coindesk.com";

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    console.log("Navigating to CoinDesk...");

    await page.goto("https://www.coindesk.com/tag/bitcoin/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    const outputPath = getStructuredOutputPath("CoinDesk");

    await saveDebugInfo(page, outputPath, "coindesk");

    console.log("Page loaded, extracting news items...");

    await page
      .waitForSelector(".article-cardstyles__AcTitle-sc-q1x8lc-1", {
        timeout: 10000,
      })
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
      const elements = document.querySelectorAll(
        "article.card-containerstyles__CardContainer-sc-1jz6i7y-0"
      );

      if (!elements || elements.length === 0) {
        console.log("No news elements found");
        return items;
      }

      elements.forEach((element) => {
        // Extract data
        const titleEl = element.querySelector(
          ".article-cardstyles__AcTitle-sc-q1x8lc-1"
        );
        const title = titleEl?.textContent?.trim() || "";

        const descriptionEl = element.querySelector(
          ".article-cardstyles__AcDek-sc-q1x8lc-2"
        );
        const description = descriptionEl?.textContent?.trim() || "";

        const categoryEl = element.querySelector(
          ".article-cardstyles__AcCategory-sc-q1x8lc-3"
        );
        const category = categoryEl?.textContent?.trim() || null;

        const timeEl = element.querySelector("time");
        const publishedTime = timeEl?.getAttribute("datetime") || "";

        const authorEl = element.querySelector(
          ".article-cardstyles__AcAuthor-sc-q1x8lc-4"
        );
        const author = authorEl?.textContent?.trim() || null;

        const linkEl = element.querySelector(
          "a.card-containerstyles__CardLink-sc-1jz6i7y-1"
        );
        const url = linkEl?.getAttribute("href") || "";

        // Extract image URL
        const imageEl = element.querySelector("img");
        const imageUrl = imageEl?.getAttribute("src") || null;

        // Add the news item to the list
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

    // Process the first 5 news items (for testing)
    const newsToProcess = newsItems.slice(0, 5);

    for (const item of newsToProcess) {
      try {
        // Form the full URL for the article
        const fullUrl = normalizeUrl(item.url, baseUrl);

        console.log(`Navigating to article: ${fullUrl}`);

        await page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Extract full article content
        const articleContent = await extractCoinDeskArticle(page, fullUrl);

        const rawNewsItem = {
          source: "coindesk",
          url: fullUrl,
          title: item.title,
          description: item.description,
          published_at: normalizeDate(item.published_time),
          fetched_at: new Date().toISOString(),
          category: item.category,
          author: item.author,
          content_type: "News",
          full_content: articleContent,
          preview_content: item.description || null,
        };

        const newsItem = sanitizeNewsItem(rawNewsItem);
        news.push(newsItem);

        await page.waitForTimeout(2000);
      } catch (error) {
        console.error(`Error processing article ${item.url}: ${error}`);
      }
    }

    return news;
  } catch (error) {
    console.error(`Error parsing CoinDesk: ${error}`);
    return news;
  } finally {
    await browser.close();
  }
}

// Function to extract full article text
async function extractCoinDeskArticle(
  page: Page,
  url: string
): Promise<string> {
  try {
    await page
      .waitForSelector(".at-content-wrapper", { timeout: 10000 })
      .catch(() => console.log("Article content not found, continuing anyway"));

    // Extract article content
    const articleContent = await page.evaluate(() => {
      // Extract title
      const title = document.querySelector("h1")?.textContent?.trim() || "";

      // Extract subtitle
      const subtitle =
        document.querySelector(".at-subheadline")?.textContent?.trim() || "";

      // Extract author
      const author =
        document.querySelector(".at-author-name")?.textContent?.trim() || "";

      // Extract publication date
      const publishedDate =
        document.querySelector("time")?.textContent?.trim() || "";

      // Extract tags
      const tags = Array.from(document.querySelectorAll(".at-tags a") || [])
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join(", ");

      // Extract the main content
      const contentElements = Array.from(
        document.querySelectorAll(
          ".at-content-wrapper p, .at-content-wrapper h2, .at-content-wrapper h3, .at-content-wrapper ul, .at-content-wrapper ol"
        ) || []
      );

      // Forming the full text
      let fullText = `# ${title}\n\n`;

      if (subtitle) {
        fullText += `${subtitle}\n\n`;
      }

      if (author || publishedDate) {
        fullText += `Автор: ${author} | Дата: ${publishedDate}\n\n`;
      }

      // Add the main content
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
        fullText += `Теги: ${tags}\n`;
      }

      return fullText;
    });

    return articleContent;
  } catch (error) {
    console.error(`Error extracting article content: ${error}`);
    return `⚠️ Ошибка при извлечении содержимого статьи: ${error}`;
  }
}

export class CoinDeskParser extends BaseParser {
  constructor() {
    super("CoinDesk", coinDeskConfig);
    this.baseUrl = "https://www.coindesk.com";
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

      // Extract links to articles
      const links = await this.page.$$eval("a[href]", (links) => {
        return links
          .filter((link) => {
            const href = link.getAttribute("href") || "";
            // Filter only links to articles
            return (
              href.includes("/markets/") ||
              href.includes("/news/") ||
              href.includes("/business/") ||
              href.includes("/policy/") ||
              href.includes("/tech/")
            );
          })
          .map((link) => {
            // Get the link text as a title
            let title = link.textContent?.trim() || "";

            // If the link text is empty, try to find the title in the parent element
            if (!title) {
              const parentTitle = link
                .closest("article")
                ?.querySelector("h2, h3")
                ?.textContent?.trim();
              if (parentTitle) title = parentTitle;
            }

            return {
              url: link.getAttribute("href") || "",
              title: title || "No title",
              // Try to extract additional information
              description:
                link
                  .closest("article")
                  ?.querySelector("p, .description")
                  ?.textContent?.trim() || "",
              category:
                link
                  .closest("article")
                  ?.querySelector(".category, .tag")
                  ?.textContent?.trim() || null,
              author:
                link
                  .closest("article")
                  ?.querySelector(".author, .byline")
                  ?.textContent?.trim() || null,
              published_time:
                link
                  .closest("article")
                  ?.querySelector("time")
                  ?.getAttribute("datetime") ||
                link
                  .closest("article")
                  ?.querySelector("time, .date")
                  ?.textContent?.trim() ||
                "",
              image_url:
                link
                  .closest("article")
                  ?.querySelector("img")
                  ?.getAttribute("src") || null,
            };
          })
          .filter((item) => item.url && item.title !== "No title")
          .slice(0, 10); // Limit to 10 links for testing
      });

      this.log(`Extracted ${links.length} links to articles`);

      // Process extracted links
      const news: NewsItem[] = [];

      for (const item of links) {
        try {
          const fullUrl = normalizeUrl(item.url, this.baseUrl);

          this.log(`Processing article: ${fullUrl}`);

          const rawNewsItem = {
            source: this.sourceName,
            url: fullUrl,
            title: cleanText(item.title),
            description: cleanText(item.description || ""),
            published_at: item.published_time
              ? normalizeDate(item.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: item.category ? cleanText(item.category) : null,
            author: item.author ? cleanText(item.author) : null,
            content_type: "News",
            full_content: await this.extractArticleContent(fullUrl),
            preview_content: item.description
              ? cleanText(item.description)
              : null,
          };

          const newsItem = sanitizeNewsItem(rawNewsItem);
          news.push(newsItem);

          // Add a small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          this.log(`Error processing article ${item.url}: ${error}`, "error");
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

        // Find title
        const titleSelectors = [
          "h1",
          ".article-title",
          ".title",
          '[class*="title"]',
        ];
        const title =
          findElement(titleSelectors)?.textContent?.trim() || "No title";

        // Find subtitle
        const subtitleSelectors = [
          "h2",
          ".subtitle",
          ".description",
          ".excerpt",
          '[class*="subtitle"]',
          '[class*="description"]',
        ];
        const subtitle =
          findElement(subtitleSelectors)?.textContent?.trim() || "";

        // Find author
        const authorSelectors = [
          ".author",
          ".byline",
          '[class*="author"]',
          '[class*="byline"]',
        ];
        const author = findElement(authorSelectors)?.textContent?.trim() || "";

        // Find date
        const dateSelectors = [
          "time",
          ".date",
          '[class*="date"]',
          '[class*="time"]',
        ];
        const date = findElement(dateSelectors)?.textContent?.trim() || "";

        // Find content paragraphs
        const contentSelectors = [
          "article p",
          ".article-content p",
          ".article-body p",
          ".content p",
          "main p",
          "p",
        ];

        // Get all paragraphs
        const paragraphs = findAllElements(contentSelectors);

        // Format full text
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
          // If paragraphs not found, try to extract all text from main container
          const mainContentSelectors = [
            "article",
            ".article-content",
            ".article-body",
            ".content",
            "main",
            "#content",
            ".post",
          ];

          const mainContent = findElement(mainContentSelectors);
          if (mainContent) {
            fullText += `${mainContent.textContent?.trim()}\n\n`;
          } else {
            fullText += "Failed to extract article content.\n\n";
          }
        }

        // Find tags
        const tagSelectors = [".tags a", '[class*="tag"] a', 'a[href*="tag"]'];
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
      this.log(
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

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    if (!this.page) return { blocked: true, reason: "Page not initialized" };

    try {
      // Check for elements that may indicate blocking
      const hasBlocker = await this.page.evaluate(() => {
        // Check for captcha
        const hasCaptcha = !!(
          document.querySelector('[class*="captcha"]') ||
          document.querySelector('[id*="captcha"]') ||
          document.querySelector('iframe[src*="captcha"]')
        );

        // Check for block messages
        const hasBlockMessage = !!(
          document
            .querySelector("body")
            ?.textContent?.includes("access denied") ||
          document.querySelector("body")?.textContent?.includes("blocked") ||
          document.querySelector("body")?.textContent?.includes("403") ||
          document.querySelector("body")?.textContent?.includes("not available")
        );

        // Check if there is any content on the page
        const hasNoContent =
          document.querySelectorAll('article, .article, a[href*="/"]')
            .length === 0;

        return hasCaptcha || hasBlockMessage || hasNoContent;
      });

      return {
        blocked: hasBlocker,
        reason: hasBlocker ? "Обнаружена блокировка" : "",
      };
    } catch (error) {
      this.log(`Error checking for blockers: ${error}`, "error");
      return { blocked: true, reason: `Error: ${error}` };
    }
  }
}
