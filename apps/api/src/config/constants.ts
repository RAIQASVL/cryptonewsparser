import path from "path";

export const TIMEZONE = "Etc/GMT-3";

export const NEWS_CHANNELS = [
  "iansintel",
  "unfolded_defi",
  "cointelegraph",
  "durov",
  "notcoin",
  "notpixel_channel",
  "threadingontheedge",
  "toncoin",
  "earn_early",
  "sticker_community",
  "join_community",
  "tonlive",
  "dogs",
];

export const FORWARD_CHANNELS = [
  "earn_early",
  "notcoin",
  "notpixel_channel",
  "sticker_community",
  "join_community",
  "feelsguyagent",
];

export const API_CONFIG = {
  API_ID: parseInt(process.env.API_ID || ""),
  API_HASH: process.env.API_HASH || "",
  PHONE_NUMBER: process.env.PHONE_NUMBER || "",
  CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL || "5") * 60 * 1000,
  FORWARD_CHECK_INTERVAL:
    parseInt(process.env.FORWARD_CHECK_INTERVAL || "5") * 60 * 1000,
  PORT: parseInt(process.env.PORT || "3000"),
};

// Logging Configuration
export const LOG_DIR_PATH = path.resolve(__dirname, "..", "..", "logs"); // Place logs dir at project root/logs
export const LOG_FILE_PATH = path.join(LOG_DIR_PATH, "app.log"); // Single log file for all processes
