#!/usr/bin/env node
import { Command } from "commander";
import { SiteName, ALL_SITE_NAMES } from "@cryptonewsparser/shared";
import { ParserFactory } from "./utils/parser-factory";
import { getRecentNewsItems, saveNewsItems, disconnect } from "./services/db";
import { cleanupOldOutputFiles } from "./utils/cleanup-utils";
import * as dotenv from "dotenv";
// Remove fs/path imports if only used for old logging
// import path from "path";
// import fs from "fs";
import { logger } from "./utils/logger"; // Import the new logger

dotenv.config();

// --- Remove Old File Logging Code ---
// const LOG_DIR = ...
// const LOG_FILE = ...
// function logToFile(...) {}
// ---

const program = new Command();
const CLI_CONTEXT = "CLI"; // Context for logs from this file

program
  .name("crypto-news-cli")
  .description("CLI for crypto news parsing and management")
  .version("1.0.0");

// Parse command
program
  .command("parse")
  .description("Parse news from crypto sources")
  .argument("[sources...]", "Sources to parse (default: all)")
  .action(async (sources: string[]) => {
    const sourcesToParse: (SiteName | "all")[] =
      sources.length > 0 ? (sources as SiteName[]) : ["all"];
    logger.info(`Parsing sources: ${sourcesToParse.join(", ")}`, CLI_CONTEXT); // Use logger

    const sitesToRun: SiteName[] =
      sourcesToParse[0] === "all"
        ? ALL_SITE_NAMES
        : (sourcesToParse as SiteName[]);

    for (const source of sitesToRun) {
      try {
        logger.info(`Starting parser for ${source}...`, CLI_CONTEXT);
        // *** CRUCIAL: Pass the logger instance ***
        const results = await ParserFactory.runParser(source, {
          headless: true, // Or false for CLI debugging? Choose one.
          logger: logger, // Pass the imported logger object
        });
        logger.info(
          `Parsed ${results.length} items from ${source}`,
          CLI_CONTEXT
        );

        if (results.length > 0) {
          await saveNewsItems(results);
          logger.info(`Saved ${results.length} items to database`, CLI_CONTEXT);
        }
      } catch (error) {
        logger.error(
          `Error parsing ${source}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          CLI_CONTEXT
        ); // Use logger
      }
    }
    logger.info(`Finished parsing run.`, CLI_CONTEXT);
    await disconnect();
  });

// Database test command
program
  .command("test-db")
  .description("Test database connection and operations")
  .action(async () => {
    try {
      logger.info("Testing database connection...", CLI_CONTEXT); // Use logger
      const items = await getRecentNewsItems(5);
      logger.info(`Retrieved ${items.length} recent items`, CLI_CONTEXT);
      if (items.length > 0) {
        console.log("Sample item:", JSON.stringify(items[0], null, 2)); // Keep console for detailed object output if needed
      }
      await disconnect();
      logger.info("Database test complete.", CLI_CONTEXT);
    } catch (error) {
      logger.error(
        `Database test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CLI_CONTEXT
      ); // Use logger
    }
  });

// Cleanup command
program
  .command("cleanup")
  .description("Clean up old output files")
  .option("-d, --days <days>", "Number of days to keep files", "30")
  .action(async (options: { days: string }) => {
    const days = parseInt(options.days, 10);
    logger.info(`Cleaning up files older than ${days} days...`, CLI_CONTEXT); // Use logger
    await cleanupOldOutputFiles(days); // Assuming this function logs internally or doesn't need detailed logging
    logger.info(`Cleanup complete.`, CLI_CONTEXT);
  });

program.parse();
