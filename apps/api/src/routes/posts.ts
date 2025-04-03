import express from "express";
import { prisma } from "../services/db";

const router = express.Router();

// Get latest posts with time window filter
router.get("/latest", async (req, res) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow as string) || 60;
    const posts = await prisma.newsItem.findMany({
      where: {
        published_at: {
          gte: new Date(Date.now() - timeWindow * 60 * 1000),
        },
      },
      orderBy: {
        published_at: "desc",
      },
    });

    res.json({ count: posts.length, posts });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Get all available news sources
router.get("/sources", async (_, res) => {
  try {
    const sources = await prisma.newsItem.findMany({
      select: { source: true },
      distinct: ["source"],
    });

    res.json(sources.map((s: { source: string }) => s.source));
  } catch (error) {
    console.error("Error fetching sources:", error);
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

// Get posts by source
router.get("/source/:source", async (req, res) => {
  try {
    const { source } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const posts = await prisma.newsItem.findMany({
      where: { source },
      orderBy: { published_at: "desc" },
      take: limit,
    });

    res.json({ count: posts.length, posts });
  } catch (error) {
    console.error(
      `Error fetching posts for source ${req.params.source}:`,
      error
    );
    res.status(500).json({ error: "Failed to fetch posts by source" });
  }
});

// Get posts by date range
router.get("/date-range", async (req, res) => {
  try {
    const startDate = req.query.start
      ? new Date(req.query.start as string)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = req.query.end
      ? new Date(req.query.end as string)
      : new Date();

    const posts = await prisma.newsItem.findMany({
      where: {
        published_at: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { published_at: "desc" },
    });

    res.json({ count: posts.length, posts });
  } catch (error) {
    console.error("Error fetching posts by date range:", error);
    res.status(500).json({ error: "Failed to fetch posts by date range" });
  }
});

export default router;
