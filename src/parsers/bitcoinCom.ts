import { chromium, Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { NewsItem } from "../types/news";
import {
  cleanText,
  normalizeUrl,
  normalizeDate,
  ensureDirectoryExists,
  saveDebugInfo,
  getStructuredOutputPath,
} from "../utils/parser-utils";
import { BaseParser } from "./BaseParser";
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
        const newsItem: NewsItem = {
          source: "bitcoincom",
          url: fullUrl,
          title: item.title,
          description: item.description,
          published_at: normalizeDate(item.published_time),
          fetched_at: new Date().toISOString(),
          category: item.category,
          image_url: item.image_url,
          author: item.author,
          tags: [],
          content_type: "News",
          reading_time: null,
          views: null,
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
  constructor() {
    super("BitcoinCom", bitcoinComConfig);
  }

  protected async extractNewsItems(): Promise<NewsItem[]> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Navigating to ${this.config.url}`);

    try {
      // Navigate to the main page
      await this.page.goto(this.config.url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for actual content to load
      await this.page
        .waitForFunction(
          () => document.querySelectorAll(".sc-hnwOTO").length > 0,
          { timeout: 15000 }
        )
        .catch(() =>
          this.log("Timed out waiting for news links to load", "warn")
        );

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Add debug logging to see what elements are being found
      const elementCounts = await this.page.evaluate(() => {
        return {
          newsContainer: document.querySelectorAll(
            ".sc-htSjYp, .sc-cYxCiX, .sc-fGGoSf"
          ).length,
          newsItem: document.querySelectorAll(
            ".sc-jbVRWv, .sc-eXGYID, .sc-bCgkFR"
          ).length,
          title: document.querySelectorAll(".sc-hpRSGa, .sc-BoTHd, h5, h6")
            .length,
          link: document.querySelectorAll(".sc-hnwOTO").length,
        };
      });

      this.log(`Element counts: ${JSON.stringify(elementCounts)}`, "info");

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
      const articles = await this.page.evaluate((selectors) => {
        // Find all article containers
        const articleContainers = Array.from(
          document.querySelectorAll(".sc-jbVRWv")
        );
        console.log(`Found ${articleContainers.length} article containers`);

        return articleContainers
          .map((container) => {
            try {
              // Find link and href
              const linkElement = container.querySelector(".sc-hnwOTO");
              const url = linkElement ? linkElement.getAttribute("href") : null;

              // Find title
              const titleElement = container.querySelector(
                ".sc-hpRSGa, .sc-BoTHd, h5, h6"
              );
              const title = titleElement
                ? titleElement.textContent?.trim()
                : null;

              // Find date
              const dateElement = container.querySelector(".sc-wrHXg");
              const date = dateElement ? dateElement.textContent?.trim() : null;

              // Find description
              const descElement = container.querySelector(".sc-eZiHJD");
              const description = descElement
                ? descElement.textContent?.trim()
                : null;

              // Find image
              const imgElement = container.querySelector("img");
              const imageUrl = imgElement
                ? imgElement.getAttribute("src")
                : null;

              console.log(`Extracted: ${title} | ${url} | ${date}`);

              return {
                title,
                url: url
                  ? url.startsWith("/")
                    ? "https://news.bitcoin.com" + url
                    : url
                  : null,
                date,
                description,
                imageUrl,
                category: null,
                author: null,
              };
            } catch (error) {
              console.error("Error extracting article:", error);
              return null;
            }
          })
          .filter((item) => item && item.title && item.url);
      }, this.config.selectors);

      this.log(`Extracted ${articles.length} articles`);

      // Filter out articles without URL or title, and links to categories
      const validArticles = articles.filter(
        (article) =>
          article?.url &&
          article?.title !== "No title" &&
          !article?.url.includes("/category/") &&
          !article?.url.includes("/tag/") &&
          !article?.url.includes("/author/") &&
          !article?.url.includes("/page/")
      );

      this.log(`Found ${validArticles.length} valid articles`);

      // Remove duplicates by URL
      const uniqueUrls = new Set<string>();
      const uniqueArticles = validArticles.filter((article) => {
        if (uniqueUrls.has(article?.url || "")) {
          return false;
        }
        uniqueUrls.add(article?.url || "");
        return true;
      });

      this.log(`Found ${uniqueArticles.length} unique articles`);

      // If no articles are found, try the alternative approach
      if (uniqueArticles.length === 0) {
        this.log(
          "No articles found on category page, trying alternative approach",
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      const articlesToProcess = uniqueArticles.slice(0, 10); // Process up to 10 articles
      this.log(`Will process ${articlesToProcess.length} articles`);

      // Process each article
      const news: NewsItem[] = [];

      for (const article of articlesToProcess) {
        try {
          this.log(`Processing article: ${article?.url}`);
          this.log(`Navigating to article: ${article?.url}`);

          // Extract full article text
          const fullContent = await this.extractArticleContent(
            article?.url || ""
          );

          // Create a news item object
          const newsItem: NewsItem = {
            source: this.sourceName,
            url: article?.url || "",
            title: cleanText(article?.title || ""),
            description: cleanText(article?.description || ""),
            published_at: article?.date
              ? normalizeDate(article?.date || "")
              : new Date().toISOString(),
            fetched_at: new Date().toISOString(),
            category: article?.category ? cleanText(article?.category) : null,
            image_url: article?.imageUrl || null,
            author: article?.author ? cleanText(article?.author) : null,
            tags: [],
            content_type: "Article",
            reading_time: null,
            views: null,
            full_content: fullContent,
          };

          news.push(newsItem);

          // Add a small delay between requests
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 + Math.random() * 1000)
          );
        } catch (error) {
          this.log(
            `Error processing article ${article?.url}: ${error}`,
            "error"
          );
        }
      }

      // Save results
      await this.saveResults(news);
      return news;
    } catch (error) {
      this.log(`Error extracting news items: ${error}`, "error");
      return [];
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    this.log(`Extracting content from: ${url}`, "info");

    try {
      // Navigate to the article
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Check for CAPTCHA or other blockers
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(`Site access blocked: ${blockCheck.reason}`, "warn");

        // Try to extract content from alternative sources
        return await this.extractContentFromAlternativeSources(url);
      }

      // Wait for the article content to load
      await this.page
        .waitForSelector(".article__body", {
          timeout: 10000,
        })
        .catch(() => {
          this.log(
            "Article content selector not found, trying alternatives",
            "warn"
          );
        });

      // Extract the article content
      const content = await this.page.evaluate(() => {
        const articleBody = document.querySelector(".article__body");
        if (articleBody) {
          return articleBody.innerHTML;
        }

        // Try alternative selectors if the main one fails
        const alternativeSelectors = [
          ".article-content",
          ".post-content",
          "article",
          ".content",
        ];

        for (const selector of alternativeSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.innerHTML;
          }
        }

        return null;
      });

      if (content) {
        return content;
      }

      // If we couldn't extract the content, try alternative sources
      return await this.extractContentFromAlternativeSources(url);
    } catch (error) {
      this.log(`Error extracting article content: ${error}`, "error");
      return `⚠️ Failed to extract article content: ${error}`;
    }
  }

  // New method for extracting content from alternative sources
  private async extractContentFromAlternativeSources(
    url: string
  ): Promise<string> {
    this.log(
      `Trying to extract content from alternative sources for: ${url}`,
      "info"
    );

    try {
      // First try to extract from RSS feed
      const rssContent = await this.extractContentFromRSS(url);
      if (rssContent && rssContent.length > 100) {
        return rssContent;
      }

      // If RSS didn't work, try to extract from Google Cache
      const googleCacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(
        url
      )}`;
      this.log(`Trying Google Cache: ${googleCacheUrl}`, "info");

      await this.page?.goto(googleCacheUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Check if Google Cache has the content
      const cacheContent = await this.page?.evaluate(() => {
        const articleBody = document.querySelector(".article__body");
        if (articleBody) {
          return articleBody.innerHTML;
        }
        return null;
      });

      if (cacheContent) {
        return cacheContent;
      }

      // If all else fails, generate a summary from the URL
      const titleFromUrl = url.split("/").pop()?.replace(/-/g, " ") || "";
      return `# ${titleFromUrl}\n\n⚠️ Full article text is not available due to site restrictions. This is an automatically generated summary.\n\nArticle published on Bitcoin.com and available at: ${url}\n\nFor full content, please visit the original page.`;
    } catch (error) {
      this.log(
        `Error extracting content from alternative sources: ${error}`,
        "error"
      );
      return `⚠️ Failed to extract article content from alternative sources: ${error}`;
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

  protected async saveResults(results: NewsItem[]): Promise<void> {
    try {
      // Use the standard output path with the parser name
      const outputPath = path.join("output", "bitcoincom.json");

      // Save the results
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      this.log(`Results saved to ${outputPath}`, "info");

      // Also save a timestamped version
      const now = new Date();
      const timestamp = now.toISOString().replace(/:/g, "-").split(".")[0];
      const dateDir = path.join(
        "output",
        "bitcoincom",
        `${now.getFullYear()}`,
        `${String(now.getMonth() + 1).padStart(2, "0")}`,
        `${String(now.getDate()).padStart(2, "0")}`
      );

      ensureDirectoryExists(dateDir);

      const timestampedPath = path.join(
        dateDir,
        `bitcoincom_${timestamp}.json`
      );
      fs.writeFileSync(timestampedPath, JSON.stringify(results, null, 2));
    } catch (error) {
      this.log(`Error saving results: ${error}`, "error");
    }
  }

  protected async checkForBlockers(): Promise<{
    blocked: boolean;
    reason: string;
  }> {
    try {
      // Check for CAPTCHA
      const hasCaptcha = await this.page?.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        const captchaIndicators = [
          "captcha",
          "robot",
          "human verification",
          "prove you're human",
          "security check",
          "are you a robot",
          "cloudflare",
          "challenge",
        ];

        return captchaIndicators.some((indicator) =>
          pageText.includes(indicator)
        );
      });

      if (hasCaptcha) {
        return { blocked: true, reason: "Captcha detected" };
      }

      // Check for access errors
      const hasAccessError = await this.page?.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        return (
          pageText.includes("access denied") ||
          pageText.includes("403") ||
          pageText.includes("forbidden") ||
          pageText.includes("not authorized")
        );
      });

      if (hasAccessError) {
        return { blocked: true, reason: "Access denied (403)" };
      }

      return { blocked: false, reason: "" };
    } catch (error) {
      this.log(`Error checking for blockers: ${error}`, "error");
      return { blocked: true, reason: `Error: ${error}` };
    }
  }

  protected async extractNewsItemsAlternative(): Promise<NewsItem[]> {
    this.log("Using alternative news extraction method", "info");

    try {
      // Try using RSS feed
      await this.page?.goto("https://news.bitcoin.com/feed", {
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

        // Log the raw XML content for debugging
        const xmlContent = await this.page?.evaluate(
          () => document.body.innerHTML
        );
        this.log(
          `RSS XML content sample: ${xmlContent?.substring(0, 200)}...`,
          "info"
        );

        // Extract data from RSS with better error handling
        const rssItems = await this.page?.evaluate(() => {
          try {
            // First try to get the XML content
            const xmlContent = document.body.innerHTML;

            // Create a temporary div to parse the XML
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = xmlContent;

            // Look for item elements
            const items = Array.from(tempDiv.querySelectorAll("item"));
            console.log(`Found ${items.length} items in RSS feed`);

            if (items.length > 0) {
              return items.map((item) => {
                const title =
                  item.querySelector("title")?.textContent || "No title";
                const link = item.querySelector("link")?.textContent || "";
                const description =
                  item.querySelector("description")?.textContent || "";
                const pubDate =
                  item.querySelector("pubDate")?.textContent || "";

                console.log(`RSS item: ${title} | ${link}`);

                return {
                  title,
                  url: link,
                  description,
                  published_time: pubDate,
                  category: item.querySelector("category")?.textContent || null,
                };
              });
            }

            return [];
          } catch (error) {
            console.error("Error parsing RSS:", error);
            return [];
          }
        });

        if (rssItems && rssItems.length > 0) {
          // Process results from RSS
          const news: NewsItem[] = [];

          for (const item of rssItems.slice(0, 10)) {
            news.push({
              source: this.sourceName,
              url: item.url,
              title: cleanText(item.title),
              description: cleanText(item.description || ""),
              published_at: item.published_time
                ? normalizeDate(item.published_time)
                : new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              category: item.category ? cleanText(item.category) : null,
              image_url: null,
              author: null,
              tags: [],
              content_type: "Article",
              reading_time: null,
              views: null,
              full_content: item.description || "",
            });
          }

          await this.saveResults(news);
          return news;
        }
      }

      // If RSS didn't work, return an empty array
      return [];
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
      return [];
    }
  }

  // Add this method to the BitcoinComParser class
  private async extractContentFromRSS(url: string): Promise<string> {
    this.log(`Trying to extract content from RSS for: ${url}`, "info");

    try {
      // Navigate to the RSS feed
      await this.page?.goto("https://news.bitcoin.com/feed", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Extract the article content from the RSS feed
      const content = await this.page?.evaluate((targetUrl) => {
        // Create a temporary div to parse the XML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = document.body.innerHTML;

        // Find all items
        const items = Array.from(tempDiv.querySelectorAll("item"));

        // Find the matching item
        for (const item of items) {
          const link = item.querySelector("link")?.textContent;
          if (link && link.includes(targetUrl.split("/").pop() || "")) {
            // Found the matching article
            const description =
              item.querySelector("description")?.textContent || "";
            const content =
              item.querySelector("content\\:encoded")?.textContent ||
              item.querySelector("content")?.textContent ||
              description;

            return content || "No content found in RSS feed";
          }
        }

        return null;
      }, url);

      return content || `Could not find content for ${url} in RSS feed`;
    } catch (error) {
      this.log(`Error extracting content from RSS: ${error}`, "error");
      return `Failed to extract content from RSS: ${error}`;
    }
  }
}
