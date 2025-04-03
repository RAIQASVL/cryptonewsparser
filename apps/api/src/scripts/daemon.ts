#!/usr/bin/env node
import { SiteName, ALL_SITE_NAMES } from "@cryptonewsparser/shared";
import { ParserFactory } from "../utils/parser-factory";
import { saveNewsItems, disconnect } from "../services/db";
import { NewsAnalytics } from "../services/analytics";
import { NewsExporter } from "../services/exporter";
import * as path from "path";
import { chromium, Browser } from "playwright";

// Configuration
const UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SOURCES_TO_PARSE: Array<SiteName | "all"> = ["all"]; // Allow 'all' string
const HEADLESS_MODE = true; // Set to false only for debugging
const MAX_BROWSER_LIFETIME = 3; // Restart browser every 3 parsing cycles
let isRunning = true;
let currentlyParsing = false;
let sharedBrowser: Browser | null = null;
let browserCycleCount = 0;
let shuttingDown = false;

// Handle graceful shutdown
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
process.on("SIGHUP", handleShutdown);

async function handleShutdown() {
  // Prevent multiple shutdown attempts
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\n🛑 Shutdown signal received. Gracefully shutting down...");
  isRunning = false;

  if (currentlyParsing) {
    console.log("Waiting for current parsing operation to complete...");
    // We'll let the current operation finish naturally
  } else {
    await cleanup();
    // Use a timeout to ensure cleanup completes before exit
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }
}

async function cleanup() {
  console.log("Cleaning up resources...");
  try {
    if (sharedBrowser) {
      await sharedBrowser.close();
      sharedBrowser = null;
      console.log("Browser instance closed.");
    }
    await disconnect();
    console.log("Database connection closed.");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

async function getSharedBrowser(headless: boolean = true): Promise<Browser> {
  if (!sharedBrowser) {
    console.log("🌐 Creating new browser instance...");
    sharedBrowser = await chromium.launch({
      headless,
      slowMo: 50,
    });
  }
  return sharedBrowser;
}

async function runParsers() {
  if (!isRunning || currentlyParsing) return;

  currentlyParsing = true;
  const startTime = new Date();
  console.log(`\n🔄 Starting parsing cycle at ${startTime.toISOString()}`);

  try {
    // Check if we need to restart the browser
    browserCycleCount++;
    if (browserCycleCount > MAX_BROWSER_LIFETIME && sharedBrowser) {
      console.log("🔄 Restarting browser to free memory...");
      await sharedBrowser.close();
      sharedBrowser = null;
      browserCycleCount = 0;
    }

    // Get or create shared browser
    const browser = await getSharedBrowser(HEADLESS_MODE);

    // Determine which sites to run
    const sitesToRun: SiteName[] = SOURCES_TO_PARSE.includes("all")
      ? ALL_SITE_NAMES
      : SOURCES_TO_PARSE.filter((site): site is SiteName => site !== "all");

    for (const source of sitesToRun) {
      if (!isRunning) break; // Check if shutdown was requested

      console.log(`📰 Parsing source: ${source}`);
      const results = await ParserFactory.runParser(source, {
        headless: HEADLESS_MODE,
        browser, // Pass the shared browser instance
      });
      console.log(`✅ Parsed ${results.length} items from ${source}`);

      if (results.length > 0) {
        await saveNewsItems(results);
        console.log(`💾 Saved ${results.length} items to database`);
      }
    }

    // Generate analytics after each cycle
    if (isRunning) {
      console.log("📊 Generating analytics...");
      await generateAnalytics();
    }
  } catch (error) {
    console.error("❌ Error during parsing cycle:", error);
  } finally {
    currentlyParsing = false;

    if (isRunning) {
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      console.log(
        `✅ Parsing cycle completed in ${duration.toFixed(2)} seconds`
      );
      console.log(
        `⏰ Next cycle scheduled in ${UPDATE_INTERVAL_MS / 60000} minutes`
      );
    } else {
      await cleanup();
      process.exit(0);
    }
  }
}

async function generateAnalytics() {
  try {
    // Source distribution
    const sourceDistribution = await NewsAnalytics.getSourceDistribution();
    NewsExporter.exportAnalyticsToJson(
      sourceDistribution,
      path.join("output", "analytics", "source_distribution.json")
    );

    // News volume by day
    const volumeByDay = await NewsAnalytics.getNewsVolumeByDay(7);
    NewsExporter.exportAnalyticsToJson(
      volumeByDay,
      path.join("output", "analytics", "volume_by_day.json")
    );

    // Trending topics
    const trendingTopics = await NewsAnalytics.getTrendingTopics(1, 20);
    NewsExporter.exportAnalyticsToJson(
      trendingTopics,
      path.join("output", "analytics", "trending_topics.json")
    );

    console.log("✅ Analytics updated successfully");
  } catch (error) {
    console.error("❌ Error generating analytics:", error);
  }
}

// Main function to start the daemon
async function startDaemon() {
  console.log("🚀 Starting Crypto News Parser Daemon");
  console.log(`⏱️  Update interval: ${UPDATE_INTERVAL_MS / 60000} minutes`);
  console.log(`📰 Sources to parse: ${SOURCES_TO_PARSE.join(", ")}`);
  console.log("Press Ctrl+C to stop the daemon");

  // Run immediately on startup
  await runParsers();

  // Then schedule regular runs
  const intervalId = setInterval(() => {
    if (isRunning) {
      runParsers();
    } else {
      clearInterval(intervalId);
    }
  }, UPDATE_INTERVAL_MS);
}

// Start the daemon
startDaemon().catch((error) => {
  console.error("Fatal error in daemon:", error);
  process.exit(1);
});
