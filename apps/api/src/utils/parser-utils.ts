import * as fs from "fs";
import * as path from "path";
import { Page } from "playwright";
import { NewsItem } from "@cryptonewsparser/shared";

// Function to clean text from extra spaces and HTML
export function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/\s+/g, " ") // Replace multiple spaces with one
    .trim();
}

// Function to normalize URL
export function normalizeUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http")) {
    return url;
  }
  return new URL(url, baseUrl).toString();
}

// Function to extract date from different formats
export function normalizeDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toISOString();

  try {
    // Special case for The Block date format: "Mar 18, 2025, 5:16PM EDT •"
    if (
      dateStr.includes(",") &&
      (dateStr.includes("AM") || dateStr.includes("PM"))
    ) {
      // Remove the trailing "•" and any timezone info
      let cleanDateStr = dateStr;
      if (cleanDateStr.includes("•")) {
        cleanDateStr = cleanDateStr.split("•")[0].trim();
      }

      // Remove timezone abbreviations that Date can't parse
      cleanDateStr = cleanDateStr
        .replace("EDT", "")
        .replace("EST", "")
        .replace("PDT", "")
        .replace("PST", "")
        .trim();

      return new Date(cleanDateStr).toISOString();
    }

    // If this is a data-utctime attribute, it's already in ISO format
    if (dateStr.includes("T") && dateStr.includes("Z")) {
      return new Date(dateStr).toISOString();
    }

    // For relative dates (e.g., "2 hours ago")
    if (dateStr.includes("ago")) {
      const now = new Date();
      if (dateStr.includes("min")) {
        const minutes = parseInt(dateStr.match(/\d+/)?.[0] || "0");
        now.setMinutes(now.getMinutes() - minutes);
      } else if (dateStr.includes("hour")) {
        const hours = parseInt(dateStr.match(/\d+/)?.[0] || "0");
        now.setHours(now.getHours() - hours);
      } else if (dateStr.includes("day")) {
        const days = parseInt(dateStr.match(/\d+/)?.[0] || "0");
        now.setDate(now.getDate() - days);
      }
      return now.toISOString();
    }

    // For regular dates
    return new Date(dateStr).toISOString();
  } catch (e) {
    console.log(`Error parsing date: ${dateStr}`);
    return new Date().toISOString();
  }
}

// Function to create a directory if it doesn't exist
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Function to save debug information
export async function saveDebugInfo(
  page: Page,
  outputDir: string,
  prefix: string
): Promise<void> {
  ensureDirectoryExists(outputDir);

  // Save screenshot
  const screenshotPath = path.join(outputDir, `${prefix}_screenshot.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  // Save HTML
  const html = await page.content();
  fs.writeFileSync(path.join(outputDir, `${prefix}_page.html`), html);
  console.log(
    `HTML content saved to ${path.join(outputDir, `${prefix}_page.html`)}`
  );
}

// Function to block unnecessary resources
export async function setupResourceBlocking(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const url = request.url();

    // Block ads, trackers and widgets
    if (
      url.includes("analytics") ||
      url.includes("tracker") ||
      url.includes("ads") ||
      url.includes("widget") ||
      resourceType === "media" ||
      resourceType === "font" ||
      resourceType === "websocket"
    ) {
      return route.abort();
    }

    return route.continue();
  });
}

/**
 * Creates a structured output path for saving parser results
 * @param sourceName The name of the news source
 * @returns The path where the output file should be saved
 */
export function getStructuredOutputPath(sourceName: string): string {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  // Create path structure: output/[source]/YYYY/MM/DD/
  const outputPath = path.join(
    "output",
    sourceName.toLowerCase(),
    `${year}`,
    `${month}`,
    `${day}`
  );

  // Ensure the directory exists
  ensureDirectoryExists(outputPath);

  return outputPath;
}

export function sanitizeNewsItem(item: any): NewsItem {
  return {
    source: item.source,
    url: item.url,
    title: item.title,
    description: item.description,
    published_at: item.published_at,
    fetched_at: item.fetched_at,
    category: item.category,
    author: item.author,
    content_type: item.content_type,
    full_content: item.full_content,
    preview_content: item.preview_content,
  };
}
