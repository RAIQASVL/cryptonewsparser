# Crypto News Parser System Documentation

## System Overview

This project is a comprehensive crypto news parsing system designed to extract news articles from various cryptocurrency and financial news websites. The system uses Playwright for browser automation to navigate websites, extract news items, and save them in a structured JSON format.

## Project Structure

```
src/
├── config/
│   └── parsers/           # Configuration for each news source
├── parsers/               # Parser implementations for each news source
├── scripts/               # CLI scripts to run parsers
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions and factory pattern
output/                    # Output directory for parsed news
```

## Core Components

### 1. Base Parser (`BaseParser.ts`)

The `BaseParser` is an abstract class that provides the foundation for all specific parsers. It handles:

- Browser initialization with Playwright
- Page navigation with resource blocking for performance
- Human behavior simulation to avoid detection
- News extraction from the main page
- Article content extraction
- Anti-blocking measures
- Saving results to JSON files

Key methods:

- `parse()`: Main entry point that orchestrates the parsing process
- `extractNewsItems()`: Extracts news items from the main page
- `extractArticleContent()`: Abstract method implemented by each parser to extract full article content
- `checkForBlockers()`: Detects if the site is blocking the parser
- `randomDelay()`: Adds random delays to mimic human behavior

### 2. Parser Factory (`parser-factory.ts`)

Implements the Factory pattern to create and manage parser instances:

- `getParser(site)`: Returns a parser instance for a specific site
- `getAllParsers()`: Returns all available parsers
- `runParser(siteName)`: Runs a specific parser and returns the results

### 3. Specific Parsers

Each news source has its own parser class that extends `BaseParser`:

- `WatcherGuruParser`
- `CoinTelegraphParser`
- `CoinDeskParser`
- `DecryptParser`
- `TheBlockParser`
- `AMBCryptoParser`
- `BitcoinMagazineParser`
- `BitcoinComParser`
- `BeInCryptoParser`
- `CryptoSlateParser`

Each parser implements the `extractArticleContent()` method with site-specific logic.

### 4. Parser Configurations

Each parser has a configuration file in `src/config/parsers/` that defines:

- CSS selectors for news items and their components
- URL to parse
- Article-specific selectors for content extraction

### 5. Utility Functions (`parser-utils.ts`)

Helper functions for common tasks:

- `cleanText()`: Removes HTML tags and normalizes whitespace
- `normalizeUrl()`: Ensures URLs are absolute
- `normalizeDate()`: Converts various date formats to ISO format
- `ensureDirectoryExists()`: Creates directories if they don't exist
- `saveDebugInfo()`: Saves screenshots and HTML for debugging
- `setupResourceBlocking()`: Blocks unnecessary resources for faster loading

### 6. Type Definitions

- `NewsItem`: Interface for structured news data
- `ParserConfig`: Interface for parser configuration
- Other utility types

## Parsing Process Flow

1. **Initialization**: The parser is created and initialized with its configuration
2. **Browser Setup**: A Playwright browser is launched with resource blocking
3. **Main Page Extraction**:
   - Navigate to the news source's main page
   - Check for blocking mechanisms
   - Extract basic news item data (title, URL, etc.)
4. **Content Enrichment**:
   - For each news item, navigate to its URL
   - Extract the full article content
   - Clean and format the content
5. **Alternative Methods**:
   - If the main method fails, try alternative approaches:
     - RSS feeds
     - Mobile versions of the site
     - Search engine results
6. **Result Saving**: Save the structured data to JSON files

## Anti-Detection Measures

The system implements several techniques to avoid being detected as a bot:

- Random delays between actions
- Simulated mouse movements and scrolling
- Partial loading of images and resources
- User-agent rotation
- Detection of blocking mechanisms (CAPTCHA, 403 errors, etc.)

## Running the Parsers

The system can be run via npm scripts defined in `package.json`:

- `pnpm parse:watcherguru`: Run the WatcherGuru parser
- `pnpm parse:cointelegraph`: Run the CoinTelegraph parser
- etc.

## Output Format

The parsers output JSON files with an array of `NewsItem` objects containing:

- Basic metadata (title, URL, author, date)
- Category and tags
- Full article content in clean text format
- Image URLs
- Reading time and other metadata when available

## Error Handling

The system implements robust error handling:

- Graceful fallbacks when elements aren't found
- Alternative extraction methods when the main method fails
- Detailed logging for debugging
- Screenshots of error states

## Extensibility

Adding a new parser involves:

1. Creating a configuration file in `src/config/parsers/`
2. Implementing a parser class that extends `BaseParser`
3. Registering the parser in `parser-factory.ts`
4. Adding a run script to `package.json`

This modular design makes it easy to add support for new news sources.
