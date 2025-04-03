import { ParserFactory, SiteName } from "../utils/parser-factory";
import * as path from "path";
import * as fs from "fs";
import { ensureDirectoryExists } from "../utils/parser-utils";
import { NewsItem } from "@cryptonewsparser/shared";
import { saveNewsItems, disconnect } from "../services/db";

// Main script for parsing crypto news
async function main() {
  console.log("=== Crypto News Parser ===");

  // Get command line arguments
  const args = process.argv.slice(2);
  const sources = args.length > 0 ? args : ["all"];

  // Create the output directory
  const outputDir = path.join(__dirname, "../../output");
  ensureDirectoryExists(outputDir);

  // Available parsers
  const availableParsers = [
    "cointelegraph",
    "coindesk",
    "cryptonews",
    "decrypt",
    "theblock",
    "ambcrypto",
    "bitcoincom",
    "bitcoinmagazine",
    "beincrypto",
    "watcherguru",
    "cryptoslate",
  ];

  // Determine which parsers to run
  const parsersToRun = sources.includes("all")
    ? availableParsers
    : sources.filter((s) => availableParsers.includes(s.toLowerCase()));

  if (parsersToRun.length === 0) {
    console.error(
      "No valid parsers specified. Available parsers:",
      availableParsers.join(", ")
    );
    process.exit(1);
  }

  console.log(`Will run the following parsers: ${parsersToRun.join(", ")}`);

  // Run the parsers sequentially
  const allResults: Record<string, NewsItem[]> = {};

  for (const parser of parsersToRun) {
    console.log(`\n=== Running ${parser} parser ===\n`);

    try {
      // Run the parser through the factory
      const results = await ParserFactory.runParser(parser as SiteName);
      allResults[parser] = results;

      // Output examples of news
      console.log(`\nSample ${parser} items:`);
      results.slice(0, 3).forEach((item, index) => {
        console.log(`\n--- News Item ${index + 1} ---`);
        console.log(`Title: ${item.title}`);
        console.log(`Description: ${item.description.substring(0, 100)}...`);
        console.log(`Category: ${item.category}`);
        console.log(`Published: ${item.published_at}`);
        console.log(`URL: ${item.url}`);
      });

      console.log(`\nTotal ${parser} items: ${results.length}`);

      // Save to database
      if (results.length > 0) {
        await saveNewsItems(results);
        console.log(`Saved ${results.length} ${parser} items to database`);
      }
    } catch (error) {
      console.error(`Error running ${parser} parser:`, error);
    }
  }

  // Save the overall result
  if (parsersToRun.length > 1) {
    const allNews: NewsItem[] = Object.values(allResults).flat();

    // Sort by publication date (from newest to oldest)
    allNews.sort(
      (a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

    fs.writeFileSync(
      path.join(outputDir, "all_news.json"),
      JSON.stringify(allNews, null, 2)
    );

    console.log(
      `\nAll results combined and saved to ${path.join(
        outputDir,
        "all_news.json"
      )}`
    );
    console.log(`Total news items across all sources: ${allNews.length}`);
  }

  // Disconnect from the database
  await disconnect();

  console.log("\n=== Parsing completed ===");
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
