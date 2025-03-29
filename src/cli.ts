#!/usr/bin/env node
import { Command } from "commander";
import { ParserFactory, SiteName } from "./utils/parser-factory";
import { getRecentNewsItems, saveNewsItems, disconnect } from "./services/db";
import { cleanupOldOutputFiles } from "./utils/cleanup-utils";

const program = new Command();

program
  .name("crypto-news-cli")
  .description("CLI for crypto news parsing and management")
  .version("1.0.0");

// Parse command
program
  .command("parse")
  .description("Parse news from crypto sources")
  .argument("[sources...]", "Sources to parse (default: all)")
  .action(async (sources) => {
    const sourcesToParse = sources.length > 0 ? sources : ["all"];
    console.log(`Parsing sources: ${sourcesToParse.join(", ")}`);

    for (const source of sourcesToParse) {
      try {
        const results = await ParserFactory.runParser(source as SiteName);
        console.log(`Parsed ${results.length} items from ${source}`);

        if (results.length > 0) {
          await saveNewsItems(results);
          console.log(`Saved ${results.length} items to database`);
        }
      } catch (error) {
        console.error(`Error parsing ${source}:`, error);
      }
    }

    await disconnect();
  });

// Database test command
program
  .command("test-db")
  .description("Test database connection and operations")
  .action(async () => {
    try {
      const items = await getRecentNewsItems(5);
      console.log(`Retrieved ${items.length} recent items`);
      if (items.length > 0) {
        console.log("Sample item:", JSON.stringify(items[0], null, 2));
      }
      await disconnect();
    } catch (error) {
      console.error("Database test failed:", error);
    }
  });

// Cleanup command
program
  .command("cleanup")
  .description("Clean up old output files")
  .option("-d, --days <days>", "Number of days to keep files", "30")
  .action(async (options) => {
    const days = parseInt(options.days, 10);
    console.log(`Cleaning up files older than ${days} days...`);
    await cleanupOldOutputFiles(days);
  });

program.parse();
