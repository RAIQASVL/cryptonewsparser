"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { NewsItem as SharedNewsItem } from "@cryptonewsparser/shared"; // Import shared type
import { NewsItemCard } from "@/components/news-item" // Renamed component
import { LogsModal } from "@/components/logs-modal"
import { EditorModal } from "@/components/editor-modal"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, SettingsIcon, RefreshCwIcon as RefreshIcon, PlayIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { getNews, updateNewsContent, triggerParse, LogEntry } from "@/lib/api"; // Import API functions

// No longer need local NewsData interface

export function NewsListPage() {
  const [news, setNews] = useState<SharedNewsItem[]>([]) // Use shared type
  const [isLoading, setIsLoading] = useState(true);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false)
  const [selectedNews, setSelectedNews] = useState<SharedNewsItem | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const { theme, setTheme } = useTheme()
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]); // State for client-side logs

  const fetchNewsData = useCallback(async () => {
    setIsLoading(true);
    const fetchedNews = await getNews(50); // Fetch 50 items
    setNews(fetchedNews);
    setIsLoading(false);
    setIsRefreshing(false); // Also turn off refreshing indicator
  }, []);

  useEffect(() => {
    fetchNewsData();
  }, [fetchNewsData]);


  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    console.log("Refreshing news data...")
    await fetchNewsData();
    // No need for setTimeout, fetchNewsData handles loading state
    console.log("News data refreshed!")
  }

  const addClientLog = (level: string, message: string) => {
    const newLog: LogEntry = { timestamp: new Date().toISOString(), level, message };
    // Add to client logs, potentially limit the number kept in state
    setClientLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep latest 50 client logs
  };

  const handleTriggerParse = async () => {
    if (isParsing) return;
    setIsParsing(true);
    addClientLog('INFO', 'Triggering backend parse for all sources...');
    setClientLogs([]); // Clear previous client logs when starting new parse
    setIsLogsModalOpen(true); // Open logs modal immediately

    const result = await triggerParse('all'); // Trigger parse for all sources

    if (result) {
      console.log("Parse triggered:", result.message);
      addClientLog('SUCCESS', `Backend parsing started: ${result.message}.`);
      addClientLog('INFO', `Refresh news list or logs in a few moments to see updates.`);
      // Optionally auto-refresh logs after a delay
      // setTimeout(() => {
      //   // Need a way to trigger refresh inside LogsModal or pass a ref/callback
      // }, 5000);
    } else {
      console.error("Failed to trigger parse.");
      addClientLog('ERROR', `Failed to trigger backend parse. Check API server logs.`);
    }
    // Keep button disabled for a bit longer to prevent spamming
    setTimeout(() => setIsParsing(false), 3000);
  }

  const handleOpenEditor = (newsItem: SharedNewsItem) => {
    setSelectedNews(newsItem)
    setIsEditorModalOpen(true)
  }

  const handleSaveEditedContent = async (id: number, content: string) => {
    if (!id) {
      console.error("Cannot save content without a valid ID.");
      return;
    }
    console.log(`Saving content for ID: ${id}`);
    const updatedItem = await updateNewsContent(id, content);
    if (updatedItem) {
      setNews(currentNews =>
        currentNews.map((item) => (item.id === id ? updatedItem : item))
      );
      console.log(`Successfully updated item ID: ${id}`);
    } else {
      console.error(`Failed to update item ID: ${id}`);
      // Optionally show an error to the user
      alert(`Failed to save changes for item ID: ${id}. Please try again.`);
    }
    setIsEditorModalOpen(false); // Close modal regardless of success/failure
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Crypto News Feed</h1>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleTriggerParse}
            title="Trigger Backend Parse & View Logs"
            disabled={isParsing}
          >
            <PlayIcon className={`h-4 w-4 ${isParsing ? 'animate-pulse' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setClientLogs([]); // Clear client logs when just viewing
              setIsLogsModalOpen(true);
            }}
            title="View Parser Logs"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Refresh News"
            disabled={isRefreshing || isLoading}
          >
            <RefreshIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle Theme"
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <main>
        {isLoading ? (
          <div className="text-center py-10">Loading news...</div>
        ) : news.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No news items found. Try triggering a parse or refreshing later.</div>
        ) : (
          <div className="space-y-6">
            {news.map((item) => (
              // Ensure item.id exists and is a number before rendering
              item.id ? <NewsItemCard key={item.id} news={item} onEdit={() => handleOpenEditor(item)} /> : null
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {isLogsModalOpen && (
          <LogsModal
            initialLogs={clientLogs}
            onClose={() => setIsLogsModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditorModalOpen && selectedNews && selectedNews.id && ( // Check for selectedNews.id
          <EditorModal
            news={selectedNews}
            onClose={() => setIsEditorModalOpen(false)}
            onSave={handleSaveEditedContent} // Pass the function directly
          />
        )}
      </AnimatePresence>
    </div>
  )
}

