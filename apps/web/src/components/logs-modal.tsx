"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { X, RefreshCwIcon as RefreshIcon } from "lucide-react"
import { getLogs, LogEntry } from "@/lib/api"; // Import API function and type

interface LogsModalProps {
  onClose: () => void;
  initialLogs?: LogEntry[]; // Allow passing initial logs (e.g., from parse trigger)
}

export function LogsModal({ onClose, initialLogs = [] }: LogsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const fetchedLogs = await getLogs(150); // Fetch latest logs
      setLogs(fetchedLogs); // Replace logs with fetched ones
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch logs:", error); // Keep console error for debugging

      // Determine the error message for the UI
      const errorMsg = error instanceof TypeError && error.message.includes('fetch') // More specific check for fetch/network errors
        ? 'Failed to connect to API server. Is it running?'
        : `Error fetching logs: ${error instanceof Error ? error.message : String(error)}`;

      // Add an error entry to the *top* of the logs displayed in the modal
      setLogs(prev => [
        { timestamp: new Date().toISOString(), level: 'ERROR', message: errorMsg },
        // Optionally keep previous logs if desired, or clear them on error:
        // ...prev // Uncomment this line to keep previous logs below the error
      ].slice(0, 150)); // Limit total entries shown

      setLastUpdated(new Date()); // Update time even on error
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []); // Dependency array is empty as getLogs is stable

  useEffect(() => {
    // Fetch logs only if no initial logs were passed
    if (initialLogs.length === 0) {
      fetchLogs();
    } else {
      setIsLoading(false); // Already have initial logs
      setLastUpdated(new Date()); // Set updated time
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose, fetchLogs, initialLogs.length]); // Add fetchLogs and initialLogs.length

  const formatTimestamp = (timestamp: string | Date): string => {
    if (!timestamp) return '';
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      // Show date if it's not today
      const today = new Date();
      const isToday = date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      const timeFormat: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      };
      const dateFormat: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      };

      if (isToday) {
        return new Intl.DateTimeFormat("en-US", timeFormat).format(date);
      } else {
        return `${new Intl.DateTimeFormat("en-US", dateFormat).format(date)} ${new Intl.DateTimeFormat("en-US", timeFormat).format(date)}`;
      }
    } catch (e) {
      console.error("Error formatting timestamp:", timestamp, e);
      return "Time Error";
    }
  }

  const getLogLevelClass = (level: string = "INFO") => { // Default to INFO if level is missing
    switch (level.toUpperCase()) {
      case "INFO":
        return "text-blue-600 dark:text-blue-400"
      case "WARNING":
      case "WARN": // Handle potential variations
        return "text-yellow-600 dark:text-yellow-400 font-semibold" // Make warnings stand out
      case "ERROR":
        return "text-red-600 dark:text-red-400 font-bold" // Make errors stand out more
      case "SUCCESS":
        return "text-green-600 dark:text-green-400"
      default:
        return "text-gray-500 dark:text-gray-400"
    }
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black/60 z-50 flex justify-start"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        ref={modalRef}
        className="bg-background h-full w-full max-w-lg md:max-w-xl lg:max-w-2xl shadow-2xl overflow-hidden flex flex-col"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-background z-10"> {/* Sticky header */}
          <h2 className="text-xl font-semibold">Parser Logs</h2>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" onClick={() => fetchLogs(true)} disabled={isLoading} className="h-7 w-7" title="Refresh Logs">
              <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" title="Close Logs">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-sm"> {/* Increased base text size slightly */}
          {isLoading && logs.length === 0 ? ( // Show loading only if logs are empty initially
            <div className="text-center py-10 text-muted-foreground">Loading logs...</div>
          ) : !isLoading && logs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No logs available.</div>
          ) : (
            <div className="space-y-2 font-mono"> {/* Use mono font for alignment */}
              {logs.map((log, index) => (
                <div key={index} className="flex items-start">
                  <span className="text-muted-foreground shrink-0 w-[110px] md:w-[150px] mr-2"> {/* Adjusted width */}
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={`${getLogLevelClass(log.level)} font-medium shrink-0 w-[70px] text-right mr-2`}> {/* Adjusted width */}
                    [{log.level?.toUpperCase() || 'LOG'}]
                  </span>
                  <span className="flex-1 break-words whitespace-pre-wrap">{log.message}</span> {/* Allow wrapping */}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t text-xs text-muted-foreground sticky bottom-0 bg-background z-10 text-center">
          Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
          {isLoading && <span className="ml-2">(Updating...)</span>}
        </div>
      </motion.div>
    </motion.div>
  )
}

