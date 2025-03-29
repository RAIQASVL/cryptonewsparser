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
import { ambCryptoConfig } from "../config/parsers/ambCrypto.config";

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
  constructor() {
    super("AmbCrypto", ambCryptoConfig);
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

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Check if we're blocked
      const blockCheck = await this.checkForBlockers();
      if (blockCheck.blocked) {
        this.log(
          `Site access blocked: ${blockCheck.reason}. Trying alternative approach...`,
          "warn"
        );
        return this.extractNewsItemsAlternative();
      }

      // Extract all articles
      const articles = await this.page.evaluate(() => {
        // Function to find articles using different selectors
        const findArticles = () => {
          // Try different selectors to find articles
          const selectors = [
            "article",
            ".post",
            ".article",
            ".news-item",
            ".card",
            "[class*='article']",
            "[class*='post']",
            // AMBCrypto specific selectors
            ".amb-article",
            ".news-card",
            ".post-item",
            // More general selectors
            "a[href*='/news/']",
            "a[href*='/article/']",
            "a[href*='/post/']",
            // Containers that may contain articles
            ".articles-container > div",
            ".news-container > div",
            ".posts-container > div",
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
            // Exclude links to categories and other service pages
            return (
              (href.includes("/news/") ||
                href.includes("/article/") ||
                href.includes("/post/")) &&
              !href.includes("/category/") &&
              !href.includes("/tag/") &&
              !href.includes("/author/") &&
              !href.includes("/page/")
            );
          });
        };

        // Find articles
        const articleElements = findArticles();

        // Extract data from found elements
        return articleElements
          .map((article) => {
            // Use different approaches for links and articles
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
              // If the link text is too short, look for a heading inside
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

            // If title still not found, try other methods
            if (!title) {
              // Look for an element with large text
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
              "p, .excerpt, .description, [class*='excerpt'], [class*='description']"
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

      // Filter articles without URL or title, and links to categories
      const validArticles = articles.filter(
        (article) =>
          article.url &&
          article.title !== "No title" &&
          !article.url.includes("/category/") // Exclude links to categories
      );

      this.log(`Found ${validArticles.length} valid articles`);

      // Remove duplicates by URL
      const uniqueUrls = new Set<string>();
      const uniqueArticles = validArticles.filter((article) => {
        if (uniqueUrls.has(article.url)) {
          return false;
        }
        uniqueUrls.add(article.url);
        return true;
      });

      this.log(`Found ${uniqueArticles.length} unique articles`);

      // Limit the number of articles to process
      const articlesToProcess = uniqueArticles.slice(0, 10);

      // Process extracted articles
      const news: NewsItem[] = [];

      for (const article of articlesToProcess) {
        try {
          const fullUrl = normalizeUrl(article.url, this.baseUrl);

          this.log(`Processing article: ${fullUrl}`);

          const newsItem: NewsItem = {
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
          };

          news.push(newsItem);

          // Add a small delay between requests
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 + Math.random() * 1000)
          );
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

      return this.extractNewsItemsAlternative();
    }
  }

  protected async extractArticleContent(url: string): Promise<string> {
    try {
      this.log(`Navigating to article: ${url}`);

      if (!this.page) throw new Error("Page not initialized");

      // Navigate to the article page
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Simulate human behavior
      await this.simulateHumanBehavior();

      // Extract article content
      const content = await this.page.evaluate(() => {
        // Function to find an element using multiple selectors
        const findElement = (selectors: string[]): Element | null => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
          }
          return null;
        };

        // Function to find all elements using multiple selectors
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

        // Search for the title
        const titleSelectors = [
          "h1",
          ".entry-title",
          ".article-title",
          ".post-title",
          "[class*='title']",
        ];
        const title =
          findElement(titleSelectors)?.textContent?.trim() || "Без заголовка";

        // Search for the subtitle
        const subtitleSelectors = [
          "h2",
          ".subtitle",
          ".description",
          "[class*='subtitle']",
          "[class*='description']",
        ];
        const subtitle =
          findElement(subtitleSelectors)?.textContent?.trim() || "";

        // Search for the author
        const authorSelectors = [
          ".author",
          ".byline",
          "[class*='author']",
          "[class*='byline']",
        ];
        const author = findElement(authorSelectors)?.textContent?.trim() || "";

        // Search for the date
        const dateSelectors = [
          "time",
          ".date",
          "[datetime]",
          "[class*='date']",
          "[class*='time']",
        ];
        const date = findElement(dateSelectors)?.textContent?.trim() || "";

        // Specific AMBCrypto content selectors
        const contentSelectors = [
          ".entry-content p",
          ".article-content p",
          ".post-content p",
          "article p",
          ".content p",
          // More specific AMBCrypto selectors
          "[class*='article'] p",
          "[class*='content'] p",
          // If paragraphs are not found, try to find the entire container
          ".entry-content",
          ".article-content",
          ".post-content",
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
          fullText += `Автор: ${author || "N/A"} | Дата: ${date || "N/A"}\n\n`;

        // Add paragraphs
        if (paragraphs.length > 0) {
          paragraphs.forEach((p) => {
            const text = p.textContent?.trim() || "";
            if (text) fullText += `${text}\n\n`;
          });
        } else {
          fullText += "Не удалось извлечь содержимое статьи.\n\n";
        }

        // Search for tags
        const tagSelectors = [
          ".tags a",
          "[class*='tag'] a",
          "a[href*='tag']",
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
      // Try using the RSS feed
      await this.page?.goto("https://ambcrypto.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Check if the RSS feed is available
      const isRssAvailable = await this.page?.evaluate(() => {
        return (
          document.body.innerText.includes("xml") ||
          document.body.innerText.includes("rss") ||
          document.body.innerText.includes("feed")
        );
      });

      if (isRssAvailable) {
        this.log("RSS feed is available, extracting news from it", "info");

        // Extract data from the RSS feed
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
              // Navigate to the article page for full content extraction
              const fullContent = await this.extractArticleContent(item.url);

              const newsItem: NewsItem = {
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
                full_content: fullContent,
              };

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

      // If RSS didn't work, try using Google to find news
      this.log("RSS not available, trying to find news via Google", "info");

      await this.page?.goto(
        "https://www.google.com/search?q=site:ambcrypto.com+crypto+news&tbm=nws",
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

      // Simulate human behavior
      await this.simulateHumanBehavior();

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
            if (!item.url.includes("ambcrypto.com")) continue;

            // Navigate to the article page for full content extraction
            const fullContent = await this.extractArticleContent(item.url);

            const newsItem: NewsItem = {
              source: this.sourceName,
              url: item.url,
              title: cleanText(item.title),
              description: cleanText(item.description || ""),
              published_at: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              category: null,
              author: null,
              content_type: "News",
              full_content: fullContent,
            };

            news.push(newsItem);

            // Add a small delay between requests
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 + Math.random() * 1000)
            );
          } catch (error) {
            this.log(`Error processing search result: ${error}`, "error");
          }
        }

        await this.saveResults(news);
        return news;
      }

      // If nothing worked, return an empty array
      this.log("Failed to extract news using alternative methods", "error");
      return [];
    } catch (error) {
      this.log(`Error in alternative extraction: ${error}`, "error");
      return [];
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
