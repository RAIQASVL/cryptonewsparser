import { NewsItem } from "@cryptonewsparser/shared";

// Define LogEntry type matching the backend
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

// Define AnalyticsData type based on backend response
export interface AnalyticsData {
  sourceDistribution: Record<string, number>;
  volumeByDay: { date: string; count: number }[];
  trendingTopics: { word: string; count: number }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export async function getNews(limit = 50): Promise<NewsItem[]> {
  try {
    const response = await fetch(`${API_URL}/news?limit=${limit}`);
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API error: ${response.status} - ${errorData}`);
    }
    const data = await response.json();
    // Ensure date fields are Date objects (optional, depends on usage)
    return data.map((item: any) => ({
      ...item,
      published_at: item.published_at ? new Date(item.published_at) : null,
      fetched_at: item.fetched_at ? new Date(item.fetched_at) : null,
      createdAt: item.createdAt ? new Date(item.createdAt) : null,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
    }));
  } catch (error) {
    console.error("Failed to fetch news:", error);
    return []; // Return empty array on error
  }
}

export async function updateNewsContent(
  id: number, // Use number for ID
  editedContent: string // Use specific field name
): Promise<NewsItem | null> {
  try {
    const response = await fetch(`${API_URL}/news/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      // Send edited_content in the body
      body: JSON.stringify({ edited_content: editedContent }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    // Ensure date fields are Date objects
    return {
      ...data,
      published_at: data.published_at ? new Date(data.published_at) : null,
      fetched_at: data.fetched_at ? new Date(data.fetched_at) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : null,
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
    };
  } catch (error) {
    console.error(`Failed to update news content for ID ${id}:`, error);
    return null; // Return null on error
  }
}

export async function getLogs(limit = 100): Promise<LogEntry[]> {
  try {
    const response = await fetch(`${API_URL}/logs?limit=${limit}`);
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API error: ${response.status} - ${errorData}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return []; // Return empty array on error
  }
}

export async function getAnalytics(): Promise<AnalyticsData | null> {
  try {
    const response = await fetch(`${API_URL}/analytics`);
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API error: ${response.status} - ${errorData}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
    return null; // Return null on error
  }
}

export async function triggerParse(
  source: string = "all"
): Promise<{ message: string } | null> {
  try {
    const response = await fetch(`${API_URL}/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source }),
    });

    if (!response.ok) {
      const errorData = await response.json(); // Expect JSON error from this endpoint
      throw new Error(
        `API error: ${response.status} - ${errorData.error || "Unknown error"}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to trigger parse for source ${source}:`, error);
    // You might want to display this error to the user
    alert(
      `Error triggering parse: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
