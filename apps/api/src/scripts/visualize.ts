import { NewsAnalytics } from "../services/analytics";
import { NewsExporter } from "../services/exporter";
import { disconnect } from "../services/db";
import * as path from "path";

async function generateVisualizations() {
  try {
    console.log("Generating data visualizations...");

    // Get source distribution
    console.log("Analyzing source distribution...");
    const sourceDistribution = await NewsAnalytics.getSourceDistribution();
    NewsExporter.exportAnalyticsToJson(
      sourceDistribution,
      path.join("output", "analytics", "source_distribution.json")
    );

    // Get top categories
    console.log("Analyzing top categories...");
    const topCategories = await NewsAnalytics.getTopCategories(15);
    NewsExporter.exportAnalyticsToJson(
      topCategories,
      path.join("output", "analytics", "top_categories.json")
    );

    // Get news volume by day
    console.log("Analyzing news volume trends...");
    const volumeByDay = await NewsAnalytics.getNewsVolumeByDay(30);
    NewsExporter.exportAnalyticsToJson(
      volumeByDay,
      path.join("output", "analytics", "volume_by_day.json")
    );

    // Get trending topics
    console.log("Analyzing trending topics...");
    const trendingTopics = await NewsAnalytics.getTrendingTopics(7, 30);
    NewsExporter.exportAnalyticsToJson(
      trendingTopics,
      path.join("output", "analytics", "trending_topics.json")
    );

    console.log("All visualizations generated successfully!");
  } catch (error) {
    console.error("Error generating visualizations:", error);
  } finally {
    await disconnect();
  }
}

// Run the visualization generation
generateVisualizations();
