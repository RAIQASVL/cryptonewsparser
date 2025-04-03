# Crypto News Parser

## Project Overview

Crypto News Parser is a comprehensive platform for collecting, analyzing, and displaying cryptocurrency news from multiple sources. The project uses a monorepo structure with a modern tech stack including TypeScript, Node.js, Next.js, Prisma, and Playwright.

## Key Features

- **Multi-Source News Aggregation**: Automatically scrapes and parses news from 12+ crypto news websites
- **Resilient Parsing**: Multiple fallback strategies to handle site changes, blocks, and CAPTCHAs
- **Content Analysis**: Extracts and analyzes news content, identifying trends and topics
- **Modern Web Interface**: Clean, responsive UI for browsing and managing news items
- **Scheduled Updates**: Daemon process for regular news collection
- **Database Storage**: Persistent storage with Prisma ORM
- **API Access**: RESTful API for accessing news data

## Project Structure

The project is organized as a monorepo with the following main components:

```
crypto-news-parser/
├── apps/
│   ├── api/                 # Backend API and parsers
│   │   ├── prisma/          # Database schema and migrations
│   │   ├── src/
│   │   │   ├── api/         # API endpoints
│   │   │   ├── config/      # Configuration files
│   │   │   ├── parsers/     # News site parsers
│   │   │   ├── scripts/     # CLI and daemon scripts
│   │   │   ├── services/    # Core services (DB, analytics)
│   │   │   └── utils/       # Utility functions
│   │   └── output/          # Parsed news output
│   └── web/                 # Frontend Next.js application
│       ├── public/          # Static assets
│       └── src/
│           ├── app/         # Next.js app router
│           ├── components/  # React components
│           └── lib/         # Frontend utilities
└── shared/                  # Shared types and utilities
    └── src/
        └── types/           # TypeScript type definitions
```

## Technical Architecture

### Backend (API)

The backend is built with Node.js and TypeScript, featuring:

1. **Base Parser System**: An extensible abstract class (`BaseParser`) that provides core functionality for all site-specific parsers:

   - Browser automation with Playwright
   - Structured logging
   - Error handling and recovery
   - Content extraction and normalization
   - Result storage

2. **Site-Specific Parsers**: Individual parser implementations for each news source that extend the base parser:

   - Custom selectors and extraction logic
   - Site-specific fallback strategies
   - Anti-blocking techniques

3. **Parser Factory**: A factory pattern implementation that manages parser instantiation and execution:

   - Browser instance sharing
   - Unified interface for all parsers
   - Centralized error handling

4. **Database Layer**: Prisma ORM for type-safe database operations:

   - Schema definition with relations
   - Migration management
   - CRUD operations for news items

5. **Analytics Service**: Processes news data to extract insights:

   - Topic identification
   - Trend analysis
   - Source statistics

6. **Daemon Process**: Background service for scheduled parsing:
   - Configurable update intervals
   - Resource management
   - Graceful shutdown handling

### Frontend (Web)

The frontend is built with Next.js and React, featuring:

1. **News Browsing Interface**:

   - Responsive grid layout
   - Filtering and sorting options
   - Pagination

2. **News Item Detail View**:

   - Full article content display
   - Metadata visualization
   - Edit capability

3. **Admin Controls**:

   - Parser status monitoring
   - Manual parsing triggers
   - Log viewing

4. **Theme Support**:
   - Light/dark mode
   - Responsive design

### Shared Package

The shared package contains common types and utilities used by both frontend and backend:

1. **News Item Types**: Defines the structure of news data
2. **Parser Types**: Defines parser interfaces and site name constants
3. **Utility Functions**: Shared helper functions

## Key Implementation Details

### Parser System

The parser system is designed for resilience and extensibility:

```typescript
// Base parser provides core functionality
export abstract class BaseParser {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected context: BrowserContext | null = null;
  protected ownsBrowser = true;
  protected baseUrl: string;
  protected logger: Logger;

  constructor(
    protected sourceName: string,
    protected config: ParserConfig,
    options: ParserOptions = {}
  ) {
    this.baseUrl = config.url;
    this.logger = options.logger || defaultLogger;
  }

  // Main parsing method with lifecycle management
  public async parse(): Promise<NewsItem[]> {
    try {
      await this.init();
      const news = await this.extractNewsItems();
      await this.saveResults(news);
      return news;
    } catch (error) {
      this.logMessage(`Error during parsing: ${error}`, "error");
      return [];
    } finally {
      await this.closeBrowser();
    }
  }

  // Abstract method that each parser must implement
  protected abstract extractArticleContent(url: string): Promise<string>;

  // Default implementation that can be overridden
  protected async extractNewsItems(): Promise<NewsItem[]> {
    // Default implementation using config.selectors
  }
}
```

### Factory Pattern

The factory pattern simplifies parser usage:

```typescript
// Usage example
const news = await ParserFactory.runParser("cointelegraph", {
  headless: true,
  browser: sharedBrowser,
});
```

### Database Schema

The database schema is defined using Prisma:

```prisma
model NewsItem {
  id          Int      @id @default(autoincrement())
  source      String
  url         String   @unique
  title       String
  description String?
  published_at DateTime
  fetched_at  DateTime @default(now())
  category    String?
  author      String?
  content_type String  @default("Article")
  full_content String?
  preview_content String?
  edited_content String?
  tags        String?
  image_url   String?

  @@index([source])
  @@index([published_at])
}
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/crypto-news-parser.git
   cd crypto-news-parser
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. Set up the database:

   ```bash
   pnpm db:migrate
   ```

5. Build the shared package:
   ```bash
   pnpm --filter @cryptonewsparser/shared build
   ```

### Running the Application

1. Start the API server:

   ```bash
   pnpm api:dev
   ```

2. Start the web interface:

   ```bash
   pnpm web:dev
   ```

3. Run the parser daemon:

   ```bash
   pnpm daemon:start
   ```

4. Run a specific parser via CLI:
   ```bash
   pnpm cli parse cointelegraph
   ```

## Development Workflow

1. **Adding a New Parser**:

   - Create a new config file in `apps/api/src/config/parsers/`
   - Create a new parser class in `apps/api/src/parsers/` extending `BaseParser`
   - Add the site name to `SiteName` type in `shared/src/types/parser.ts`
   - Register the parser in `ParserFactory`

2. **Modifying the Database Schema**:

   - Edit `apps/api/prisma/schema.prisma`
   - Run `pnpm db:migrate:dev` to create a migration
   - Update related types in `shared/src/types/`

3. **Adding Frontend Features**:
   - Add components in `apps/web/src/components/`
   - Update API client in `apps/web/src/lib/api.ts`
   - Add or modify pages in `apps/web/src/app/`

## Deployment

The application can be deployed using various methods:

1. **Docker Deployment**:

   - Build Docker images for API and web
   - Use Docker Compose for orchestration

2. **Traditional Deployment**:

   - Build the applications: `pnpm build`
   - Use PM2 or similar for process management

3. **Cloud Deployment**:
   - Deploy API to services like Render, Railway, or Fly.io
   - Deploy web to Vercel or Netlify

## Future Enhancements

1. **AI-Powered Analysis**: Implement AI models for content summarization and sentiment analysis
2. **Real-time Updates**: Add WebSocket support for live updates
3. **User Accounts**: Add authentication and personalized news feeds
4. **Mobile App**: Develop a companion mobile application
5. **Additional Sources**: Expand the number of supported news sources
6. **Advanced Analytics**: Implement more sophisticated trend analysis

## Conclusion

Crypto News Parser provides a robust solution for aggregating and analyzing cryptocurrency news. Its modular architecture allows for easy extension and maintenance, while the separation of concerns between the API and web interface enables flexible deployment options.
