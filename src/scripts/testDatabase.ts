import { getRecentNewsItems, saveNewsItems, disconnect } from "../services/db";
import { NewsItem } from "../types/news";

async function testDatabase() {
  try {
    // Create a test news item
    const testItem: NewsItem = {
      source: "Test Source",
      url: "https://test.com/article-1",
      title: "Test Article",
      description: "This is a test article",
      published_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      category: "Test",
      author: "Test Author",
      content_type: "Test",
      full_content: "This is the full content of the test article.",
      preview_content: "This is a preview of the test article.",
    };

    // Save the test item
    await saveNewsItems([testItem]);
    console.log("Test item saved successfully");

    // Retrieve recent items
    const items = await getRecentNewsItems(10);
    console.log(`Retrieved ${items.length} items`);
    console.log(JSON.stringify(items[0], null, 2));

    // Disconnect from the database
    await disconnect();
  } catch (error) {
    console.error("Database test failed:", error);
  }
}

testDatabase();
