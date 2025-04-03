import fs from "fs";
import path from "path";
import { LOG_FILE_PATH, LOG_DIR_PATH } from "../config/constants"; // Assuming constants file exists

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR_PATH)) {
  try {
    fs.mkdirSync(LOG_DIR_PATH, { recursive: true });
    console.log(`Log directory created: ${LOG_DIR_PATH}`);
  } catch (err) {
    console.error(`Error creating log directory ${LOG_DIR_PATH}:`, err);
    // Depending on requirements, you might want to exit or handle this differently
  }
}

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG", // Optional: For more verbose logging
}

// Determine enabled log level (e.g., from environment variable)
const enabledLogLevel = (process.env.LOG_LEVEL?.toUpperCase() ||
  LogLevel.INFO) as LogLevel;
const LOG_LEVEL_ORDER = [
  LogLevel.DEBUG,
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
];

function isLevelEnabled(level: LogLevel): boolean {
  const currentIndex = LOG_LEVEL_ORDER.indexOf(level);
  const enabledIndex = LOG_LEVEL_ORDER.indexOf(enabledLogLevel);
  return currentIndex >= enabledIndex;
}

// Define the Logger type/interface
export type Logger = {
  info: (message: string, context?: string) => void;
  warn: (message: string, context?: string) => void;
  error: (message: string, context?: string) => void;
  debug: (message: string, context?: string) => void;
};

/**
 * Logs a message to both the console and the shared log file.
 * @param level The severity level of the log message.
 * @param message The message content to log.
 * @param context Optional context (e.g., 'CLI', 'API', 'Daemon', 'ParserName')
 */
export function log(level: LogLevel, message: string, context?: string): void {
  if (!isLevelEnabled(level)) {
    return; // Skip logging if the level is below the configured threshold
  }

  const timestamp = new Date().toISOString();
  const contextPrefix = context ? `[${context}] ` : "";
  const logLine = `[${timestamp}] [${level}] ${contextPrefix}${message}\n`;
  const consoleLine = `[${timestamp}] [${level}] ${contextPrefix}${message}`; // No newline for console

  // Log to console
  switch (level) {
    case LogLevel.ERROR:
      console.error(consoleLine);
      break;
    case LogLevel.WARN:
      console.warn(consoleLine);
      break;
    case LogLevel.INFO:
      console.info(consoleLine);
      break;
    case LogLevel.DEBUG:
      console.debug(consoleLine); // console.debug might not show in all terminals
      break;
    default:
      console.log(consoleLine);
  }

  // Append to log file
  try {
    fs.appendFileSync(LOG_FILE_PATH, logLine, "utf8");
  } catch (err) {
    // Log error about logging failure to console ONLY to avoid infinite loop
    console.error(
      `[${new Date().toISOString()}] [ERROR] [Logger] Failed to write to log file ${LOG_FILE_PATH}:`,
      err
    );
  }
}

// Convenience functions using the Logger type
export const logger: Logger = {
  info: (message: string, context?: string) =>
    log(LogLevel.INFO, message, context),
  warn: (message: string, context?: string) =>
    log(LogLevel.WARN, message, context),
  error: (message: string, context?: string) =>
    log(LogLevel.ERROR, message, context),
  debug: (message: string, context?: string) =>
    log(LogLevel.DEBUG, message, context),
};

/**
 * Reads and parses the last N lines from the log file.
 * @param limit Max number of log entries to return.
 * @returns Array of parsed LogEntry objects.
 */
export async function readLogFile(limit: number = 150): Promise<LogEntry[]> {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return []; // No log file yet
    }
    // Read the whole file - potentially inefficient for very large files
    // For production, consider streaming or reading only the end of the file
    const logData = await fs.promises.readFile(LOG_FILE_PATH, "utf8");
    const lines = logData.trim().split("\n");

    const logEntries: LogEntry[] = lines
      .map((line) => {
        // Enhanced parsing to handle optional context
        const match = line.match(
          /^\[(.*?)\]\s+\[(.*?)\]\s+(?:\[(.*?)\]\s+)?(.*)$/
        );
        if (match) {
          // match[1] = timestamp, match[2] = level, match[3] = context (optional), match[4] = message
          return {
            timestamp: match[1],
            level: match[2],
            // context: match[3], // Could add context to LogEntry if needed
            message: match[3] ? `[${match[3]}] ${match[4]}` : match[4], // Prepend context back to message for now
          };
        }
        return null; // Ignore lines that don't match
      })
      .filter((entry): entry is LogEntry => entry !== null) // Type guard
      .reverse(); // Newest first

    return logEntries.slice(0, limit);
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [Logger] Error reading log file ${LOG_FILE_PATH}:`,
      error
    );
    // Return an error entry to be displayed in the UI
    return [
      {
        timestamp: new Date().toISOString(),
        level: LogLevel.ERROR,
        message: `[Logger] Could not read log file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ];
  }
}

// Interface matching the frontend's expectation
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}
