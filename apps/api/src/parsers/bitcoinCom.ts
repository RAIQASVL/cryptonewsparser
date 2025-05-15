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
  sanitizeNewsItem,
} from "../utils/parser-utils";
import { BaseParser, ParserConfig } from "./BaseParser";
import { ParserOptions } from "../utils/parser-factory";
import { bitcoinComConfig } from "../config/parsers/bitcoinCom.config";

export async function parseBitcoinCom(): Promise<NewsItem[]> {
  console.log("Starting to parse Bitcoin.com...");
  const news: NewsItem[] = [];
  const baseUrl = "https://news.bitcoin.com";

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

    console.log("Navigating to Bitcoin.com...");

    // Go to the news page
    await page.goto("https://news.bitcoin.com/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    const outputDir = path.join(__dirname, "../../output");
    ensureDirectoryExists(outputDir);

    // Save debug information
    await saveDebugInfo(page, outputDir, "bitcoincom");

    console.log("Page loaded, extracting news items...");

    // Wait for the news container to appear
    await page
      .waitForSelector(".story-box", { timeout: 10000 })
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
      const elements = document.querySelectorAll(".story-box");

      if (!elements || elements.length === 0) {
        console.log("No news elements found");
        return items;
      }

      elements.forEach((element) => {
        // Extract data
        const titleEl = element.querySelector(".story-box-title");
        const title = titleEl?.textContent?.trim() || "";

        const descriptionEl = element.querySelector(".story-box-excerpt");
        const description = descriptionEl?.textContent?.trim() || "";

        const categoryEl = element.querySelector(".story-box-category");
        const category = categoryEl?.textContent?.trim() || null;

        const timeEl = element.querySelector(".story-box-date");
        const publishedTime = timeEl?.textContent?.trim() || "";

        const authorEl = element.querySelector(".story-box-author");
        const author = authorEl?.textContent?.trim() || null;

        const linkEl = element.querySelector("a.story-box-link");
        const url = linkEl?.getAttribute("href") || "";

        // Extract image URL
        const imageEl = element.querySelector(".story-box-image img");
        const imageUrl = imageEl?.getAttribute("src") || null;

        // Add news item to the list
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

        // Go to the article page
        await page.goto(fullUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        // Extract full article content
        const articleContent = await extractBitcoinComArticle(page, fullUrl);

        // Create a news item object
        const rawNewsItem = {
          source: "bitcoincom",
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

        // Use sanitizeNewsItem
        const newsItem = sanitizeNewsItem(rawNewsItem);
        news.push(newsItem);

        // Make a pause between requests
        await page.waitForTimeout(2000);
      } catch (error) {
        console.error(`Error processing article ${item.url}: ${error}`);
      }
    }

    return news;
  } catch (error) {
    console.error(`Error parsing Bitcoin.com: ${error}`);
    return news;
  } finally {
    await browser.close();
  }
}

// Function to extract full article text
async function extractBitcoinComArticle(
  page: Page,
  url: string
): Promise<string> {
  try {
    const outputDir = path.join(__dirname, "../../output");
    ensureDirectoryExists(outputDir);

    const articleScreenshotPath = path.join(
      outputDir,
      `bitcoincom_article_${Date.now()}.png`
    );
    await page.screenshot({
      path: articleScreenshotPath,
      fullPage: true,
    });
    console.log(`Скриншот статьи сохранен: ${articleScreenshotPath}`);

    await page
      .waitForSelector(".article__body, .article-content, .post-content", {
        timeout: 10000,
      })
      .catch(() => console.log("Article content not found, continuing anyway"));

    // Extract article content with improved processing
    const articleContent = await page.evaluate(() => {
      // Extract title
      let title = "";
      const isLink = document.querySelector("a.story-box-link");
      if (isLink) {
        title =
          document.querySelector(".story-box-title")?.textContent?.trim() || "";

        // If link text is too short or long, look for heading inside
        if (title.length < 15 || title.length > 200) {
          const headingElement = document.querySelector("h1, h2, h3, h4");
          if (headingElement) {
            title = headingElement.textContent?.trim() || "";
          }
        }
      } else {
        // Bitcoin.com specific title selectors
        const titleSelectors = [
          ".story-box__title",
          ".story-teaser__title",
          "h1, h2, h3, h4",
          ".title",
          "[class*='title']",
        ];

        for (const selector of titleSelectors) {
          const titleElement = document.querySelector(selector);
          if (titleElement) {
            title = titleElement.textContent?.trim() || "";
            if (title) break;
          }
        }
      }

      // Extract description
      let description = "";
      const descriptionSelectors = [
        ".story-box__excerpt",
        ".story-teaser__excerpt",
        "p",
        ".excerpt",
        ".description",
      ];

      for (const selector of descriptionSelectors) {
        const descElement = document.querySelector(selector);
        if (descElement) {
          description = descElement.textContent?.trim() || "";
          if (description) break;
        }
      }

      // Extract date
      let publishedTime = "";
      const dateSelectors = [
        "time",
        ".date",
        ".time",
        ".published",
        "[datetime]",
        "[data-time]",
      ];

      for (const selector of dateSelectors) {
        const dateElement = document.querySelector(selector);
        if (dateElement) {
          publishedTime =
            dateElement.getAttribute("datetime") ||
            dateElement.textContent?.trim() ||
            "";
          if (publishedTime) break;
        }
      }

      // Extract image
      let imageUrl = null;
      const imageElement = document.querySelector(".story-box-image img");
      if (imageElement) {
        imageUrl =
          imageElement.getAttribute("src") ||
          imageElement.getAttribute("data-src") ||
          imageElement.getAttribute("data-lazy-src") ||
          null;
      }

      // Extract author
      let author = null;
      const authorSelectors = [
        ".author",
        ".byline",
        "[rel='author']",
        ".story-box__author",
        ".story-teaser__author",
      ];

      for (const selector of authorSelectors) {
        const authorElement = document.querySelector(selector);
        if (authorElement) {
          author = authorElement.textContent?.trim() || null;
          if (author) break;
        }
      }

      // Extract category
      let category = null;
      const categorySelectors = [
        ".story-box__category",
        ".story-teaser__category",
        ".category",
        ".tag",
      ];

      for (const selector of categorySelectors) {
        const categoryElement = document.querySelector(selector);
        if (categoryElement) {
          category = categoryElement.textContent?.trim() || null;
          if (category) break;
        }
      }

      // Forming the full text
      let fullText = `# ${title}\n\n`;

      if (description) {
        fullText += `${description}\n\n`;
      }

      if (author || publishedTime) {
        fullText += `Автор: ${author} | Дата: ${publishedTime}\n\n`;
      }

      // Add the main content with improved processing
      const contentElements = Array.from(
        document.querySelectorAll(
          ".article-content p, .article-content h2, .article-content h3, .article-content ul, .article-content ol, .article-content blockquote, " +
            ".article__body p, .article__body h2, .article__body h3, .article__body ul, .article__body ol, .article__body blockquote"
        ) || []
      );

      contentElements.forEach((element) => {
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim() || "";

        if (!text) return;

        if (tagName === "h2") {
          fullText += `## ${text}\n\n`;
        } else if (tagName === "h3") {
          fullText += `### ${text}\n\n`;
        } else if (tagName === "blockquote") {
          fullText += `> ${text}\n\n`;
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

      if (category) {
        fullText += `Category: ${category}\n`;
      }

      return fullText;
    });

    return articleContent;
  } catch (error) {
    console.error(`Error extracting article content: ${error}`);
    return `⚠️ Error extracting article content: ${error}`;
  }
}

export class BitcoinComParser extends BaseParser {
  constructor(options: ParserOptions) {
    super("bitcoincom", bitcoinComConfig, options);
    this.logMessage("BitcoinComParser initialized");
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page) {
      throw new Error("Page not initialized for extractArticleContent");
    }
    this.logMessage(`Extracting content from: ${url}`);

    try {
      if (this.page.url() !== url) {
        await this.page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
        this.logMessage(`Navigated to article page: ${url}`);
      } else {
        this.logMessage(`Already on article page: ${url}`);
      }

      const contentSelector = this.config.articleSelectors.content;
      if (!contentSelector) {
        this.logMessage(
          "Article content selector is not defined in config",
          "error"
        );
        return "";
      }

      const contentElement = await this.page.waitForSelector(contentSelector, {
        timeout: 15000,
      });
      if (!contentElement) {
        this.logMessage(
          `Content element not found using selector: ${contentSelector}`,
          "warn"
        );
        return "";
      }

      const textContent = await contentElement.textContent();
      const cleanedContent = cleanText(textContent || "");
      this.logMessage(
        `Extracted content length: ${cleanedContent.length}`,
        "debug"
      );
      return cleanedContent;
    } catch (error) {
      this.logMessage(
        `Error extracting article content from ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error"
      );
      return "";
    }
  }
}
