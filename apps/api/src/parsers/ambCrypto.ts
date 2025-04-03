import { chromium, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { NewsItem } from "@cryptonewsparser/shared";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  saveDebugInfo,
  getStructuredOutputPath,
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser, ParserConfig } from "./BaseParser";
import { ambCryptoConfig } from "../config/parsers/ambCrypto.config";
import { ParserOptions } from "../utils/parser-factory";

// Parser for AMBCrypto
export async function parseAMBCrypto(): Promise<NewsItem[]> {
  console.log("Starting to parse AMBCrypto...");
  const news: NewsItem[] = [];
  const baseUrl = "https://ambcrypto.com";

  // Start browser
  const browser = await chromium.launch({
    headless: false, // For debugging
    slowMo: 50,
  });

  try {
    const page = await browser.newPage();

    // Set User-Agent as a regular browser
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    console.log("Navigating to AMBCrypto...");

    // Navigate to the news page
    await page.goto("https://ambcrypto.com/category/news/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Create output directory if it doesn't exist
    const outputPath = getStructuredOutputPath("AMBCrypto");

    // Save debug information
    await saveDebugInfo(page, outputPath, "ambcrypto");

    console.log("Page loaded, extracting news items...");

    // Wait for news container
    await page
      .waitForSelector(".jeg_posts", { timeout: 10000 })
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
      const elements = document.querySelectorAll("article.jeg_post");

      if (!elements || elements.length === 0) {
        console.log("No news elements found");
        return items;
      }

      elements.forEach((element) => {
        // Extract data
        const titleEl = element.querySelector(".jeg_post_title");
        const title = titleEl?.textContent?.trim() || "";

        const descriptionEl = element.querySelector(".jeg_post_excerpt");
        const description = descriptionEl?.textContent?.trim() || "";

        const categoryEl = element.querySelector(".jeg_post_category");
        const category = categoryEl?.textContent?.trim() || null;

        const timeEl = element.querySelector(".jeg_meta_date");
        const publishedTime = timeEl?.textContent?.trim() || "";

        const authorEl = element.querySelector(".jeg_meta_author");
        const author = authorEl?.textContent?.replace("By", "").trim() || null;

        const linkEl = element.querySelector(".jeg_post_title a");
        const url = linkEl?.getAttribute("href") || "";

        // Extract image URL
        const imageEl = element.querySelector(".jeg_thumb img");
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

        // Navigate to the article page
        await page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Extract full article content
        const articleContent = await extractAMBCryptoArticle(page, fullUrl);

        // Create news item object
        const newsItem: NewsItem = {
          source: "ambcrypto",
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
    console.error(`Error parsing AMBCrypto: ${error}`);
    return news;
  } finally {
    await browser.close();
  }
}

// Function for extracting full article text
async function extractAMBCryptoArticle(
  page: Page,
  url: string
): Promise<string> {
  try {
    // Wait for article content to load
    await page
      .waitForSelector(".content-inner", { timeout: 10000 })
      .catch(() => console.log("Article content not found, continuing anyway"));

    // Extract article content
    const articleContent = await page.evaluate(() => {
      // Extract title
      const title =
        document.querySelector(".jeg_post_title")?.textContent?.trim() || "";

      // Extract subtitle
      const subtitle =
        document.querySelector(".jeg_post_subtitle")?.textContent?.trim() || "";

      // Extract author
      const author =
        document
          .querySelector(".jeg_meta_author")
          ?.textContent?.replace("By", "")
          .trim() || "";

      // Extract published date
      const publishedDate =
        document.querySelector(".jeg_meta_date")?.textContent?.trim() || "";

      // Extract tags
      const tags = Array.from(
        document.querySelectorAll(".jeg_post_tags a") || []
      )
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join(", ");

      // Extract main content
      const contentElements = Array.from(
        document.querySelectorAll(
          ".content-inner p, .content-inner h2, .content-inner h3, .content-inner ul, .content-inner ol"
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
          // For lists,pprocessieachpitemseparately
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

export class AMBCryptoParser extends BaseParser {
  constructor(options: ParserOptions) {
    super("ambcrypto", ambCryptoConfig, options);
    this.logMessage("AMBCryptoParser initialized");
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");
    this.logMessage(`Navigating to ${this.config.url}`);
    try {
      await this.page.goto(this.config.url, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await this.simulateHumanBehavior();

      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.logMessage(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      const newsData = await this.page.evaluate((selectors) => {
        // Define the return type explicitly
        const items: Array<{
          title: string;
          url: string;
          description?: string;
          published_time?: string;
          category?: string | null;
          author?: string | null;
          image_url?: string | null;
        }> = [];

        // ... evaluation logic ...

        return items;
      }, this.config.selectors);

      this.logMessage(`Found ${newsData.length} potential news items.`);

      const news: NewsItem[] = [];
      for (const item of newsData.slice(0, 10)) {
        try {
          const itemUrl = normalizeUrl(item.url, this.baseUrl);
          this.logMessage(`Processing article: ${itemUrl}`);
          const fullContent = await this.extractArticleContent(itemUrl);
          const rawNewsItem = {
            source: this.sourceName,
            url: itemUrl,
            title: cleanText(item.title),
            description: cleanText(item.description || ""),
            published_at: item.published_time
              ? normalizeDate(item.published_time)
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: item.category ? cleanText(item.category) : null,
            author: item.author ? cleanText(item.author) : null,
            content_type: "Article",
            full_content: fullContent,
            preview_content: item.description
              ? cleanText(item.description)
              : null,
          };
          news.push(sanitizeNewsItem(rawNewsItem));
          await this.randomDelay();
        } catch (error) {
          this.logMessage(
            `Error processing article ${item.url}: ${error}`,
            "error"
          );
        }
      }

      await this.saveResults(news);
      return news;
    } catch (error) {
      this.logMessage(`Error extracting news items: ${error}`, "error");
      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page)
      throw new Error("Page not initialized for extractArticleContent");
    this.logMessage(`Extracting content from: ${url}`);
    try {
      await this.page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      const contentSelector = this.config.articleSelectors.content;
      const contentElement = await this.page.waitForSelector(contentSelector, {
        timeout: 15000,
      });
      const text = (await contentElement?.textContent()) || "";
      return cleanText(text);
    } catch (error) {
      this.logMessage(
        `Error extracting article content from ${url}: ${error}`,
        "error"
      );
      return "";
    }
  }

  private async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.logMessage("Using alternative method (e.g., RSS)", "info");
    // ... implementation ...
    return [];
  }

  protected async simulateHumanBehavior(): Promise<void> {
    if (!this.page) return;
    this.logMessage("Simulating human behavior...", "debug");
    // ... implementation ...
  }
}
