import express, { Request, Response } from "express";
import cors from "cors";
import { SiteName, ALL_SITE_NAMES } from "@cryptonewsparser/shared";
import { ParserFactory } from "../utils/parser-factory";
import {
  getLatestNews,
  updateNewsItemContent,
  getSourceStats,
  getTrendingTopics,
  disconnect,
  saveNewsItems,
} from "../services/db";
import { NewsAnalytics } from "../services/analytics";
import { logger, readLogFile, LogEntry } from "../utils/logger"; // Import the new logger

const app = express();
const PORT = process.env.PORT || 3001;
const API_CONTEXT = "API"; // Context for logs from this file

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get("/api/status", (req: Request, res: Response) => {
  res.json({ status: "online", version: "1.0.0" });
});

// Get latest news
app.get("/api/news", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const news = await getLatestNews(limit);
    res.json(news);
  } catch (error) {
    logger.error(
      `Failed to fetch news: ${
        error instanceof Error ? error.message : String(error)
      }`,
      API_CONTEXT
    );
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Update news item content (PATCH)
app.patch("/api/news/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { edited_content } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid news item ID" });
    }
    if (typeof edited_content !== "string") {
      return res.status(400).json({ error: "edited_content must be a string" });
    }

    const updatedItem = await updateNewsItemContent(id, edited_content);

    if (!updatedItem) {
      logger.warn(
        `News item not found or failed to update for ID: ${id}`,
        API_CONTEXT
      );
      return res
        .status(404)
        .json({ error: "News item not found or failed to update" });
    }
    logger.info(`Successfully updated news item ID: ${id}`, API_CONTEXT);
    res.json(updatedItem);
  } catch (error) {
    logger.error(
      `Error updating news item ${req.params.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      API_CONTEXT
    );
    res.status(500).json({ error: "Failed to update news item" });
  }
});

// Get analytics
app.get("/api/analytics", async (req: Request, res: Response) => {
  try {
    const sourceDistribution = await NewsAnalytics.getSourceDistribution();
    const volumeByDay = await NewsAnalytics.getNewsVolumeByDay(7);
    const trendingTopics = await NewsAnalytics.getTrendingTopics(7, 15);

    const analyticsData = {
      sourceDistribution,
      volumeByDay,
      trendingTopics,
    };
    res.json(analyticsData);
  } catch (error) {
    logger.error(
      `Failed to fetch analytics: ${
        error instanceof Error ? error.message : String(error)
      }`,
      API_CONTEXT
    );
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Trigger parser run
app.post("/api/parse", async (req: Request, res: Response) => {
  try {
    const { source = "all" } = req.body;
    if (!source || typeof source !== "string") {
      return res.status(400).json({ error: "Source string is required" });
    }

    const validSources = [...ALL_SITE_NAMES, "all"];
    if (!validSources.includes(source as SiteName) && source !== "all") {
      return res.status(400).json({ error: `Invalid source: ${source}` });
    }

    const message = `Parser run for ${source} initiated via API`;
    res.json({ message });
    logger.info(message, API_CONTEXT);

    const sourcesToRun: SiteName[] =
      source === "all" ? ALL_SITE_NAMES : [source as SiteName];

    (async () => {
      for (const site of sourcesToRun) {
        try {
          logger.info(`Starting parser for ${site}...`, API_CONTEXT);
          const results = await ParserFactory.runParser(site, {
            headless: true,
            logger: logger,
          });
          logger.info(
            `Parsed ${results.length} items from ${site}`,
            API_CONTEXT
          );

          if (results.length > 0) {
            await saveNewsItems(results);
            logger.info(
              `Saved ${results.length} items from ${site} to database`,
              API_CONTEXT
            );
          }
        } catch (error) {
          logger.error(
            `Error parsing ${site}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            API_CONTEXT
          );
        }
      }
      logger.info(
        `Finished API-initiated parsing run for: ${source}`,
        API_CONTEXT
      );
    })();
  } catch (error) {
    logger.error(
      `Failed to start parser run: ${
        error instanceof Error ? error.message : String(error)
      }`,
      API_CONTEXT
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start parser run" });
    }
  }
});

// --- LOGS Endpoint ---

app.get("/api/logs", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 150;
    const logs = await readLogFile(limit);
    res.json(logs);
  } catch (error) {
    logger.error(
      `Failed to process /api/logs request: ${
        error instanceof Error ? error.message : String(error)
      }`,
      API_CONTEXT
    );
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// Get daemon status (Placeholder - Adapt if real status is implemented)
app.get("/api/daemon/status", (req, res) => {
  logger.info("Daemon status requested (placeholder).", API_CONTEXT);
  res.json({
    running: true,
    lastRun: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    nextRun: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    statusMessage: "Running smoothly (placeholder)",
  });
});

// Start/stop daemon (Placeholder - Adapt if real control is implemented)
app.post("/api/daemon/control", (req, res) => {
  const { action } = req.body;
  if (action === "start") {
    logger.info("Daemon start initiated (placeholder).", API_CONTEXT);
    res.json({ status: "Daemon start initiated (placeholder)" });
  } else if (action === "stop") {
    logger.info("Daemon stop initiated (placeholder).", API_CONTEXT);
    res.json({ status: "Daemon stop initiated (placeholder)" });
  } else {
    res.status(400).json({ error: "Invalid action" });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`, API_CONTEXT);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info(
    "SIGINT signal received: closing HTTP server and DB connection",
    API_CONTEXT
  );
  await disconnect();
  process.exit(0);
});
