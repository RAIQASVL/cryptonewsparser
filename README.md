# Crypto News Parser System Documentation

## System Overview

This project is a comprehensive crypto news parsing system designed to extract news articles from various cryptocurrency and financial news websites. The system uses Playwright for browser automation to navigate websites, extract news items, and save them in a structured format. Data is stored in a PostgreSQL database (hosted on NEON.tech) and can be analyzed through built-in visualization tools.

## Project Structure

```
src/
├── cli.ts                 # Command-line interface for the system
├── config/parsers/        # Configuration for each news source
├── parsers/               # Parser implementations for each news source
├── scripts/               # CLI scripts to run parsers and utilities
│   └── daemon.ts          # Background processing daemon
├── services/              # Core services (database, analytics, export)
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions and factory pattern
output/                    # Output directory for parsed news and analytics
prisma/                    # Database schema and migrations
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- pnpm package manager
- PostgreSQL database (a NEON.tech account)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Set up environment variables in `.env`:
   ```
   DATABASE_URL="postgresql://username:password@your-neon-db-host:5432/dbname"
   ```
4. Run database migrations:
   ```
   pnpm prisma migrate dev
   ```

## Using the CLI

The system provides a unified CLI for all operations:

```bash
# Run all parsers and save to database
pnpm cli parse

# Run a specific parser
pnpm cli parse cointelegraph coindesk

# Test database connection
pnpm cli test-db

# Clean up old output files
pnpm cli cleanup --days 14
```

## Running Parsers

### Using the CLI

```bash
# Parse all sources
pnpm parse:all

# Parse specific sources
pnpm cli parse cointelegraph decrypt theblock
```

### Using npm Scripts

The system provides dedicated scripts for each parser:

```bash
# Run the CoinTelegraph parser
pnpm parse:cointelegraph

# Run the CoinDesk parser
pnpm parse:coindesk

# Run all parsers
pnpm parse
```

## Background Processing Daemon

The system includes a daemon for continuous background processing of news sources.

### Starting the Daemon

```bash
# Run in foreground (visible logs in terminal)
pnpm daemon:start

# Run in background (detached mode)
pnpm daemon:start:detached

# View logs when running in detached mode
pnpm daemon:log
```

### Daemon Features

- **Automatic Scheduling**: Parses all news sources every 10 minutes
- **Headless Operation**: Runs browsers invisibly in the background
- **Resource Optimization**: Shares browser instances between parsers
- **Memory Management**: Automatically restarts browsers to prevent memory leaks
- **Graceful Shutdown**: Handles termination signals properly (Ctrl+C)
- **Analytics Generation**: Updates analytics data after each parsing cycle

### Production Deployment with PM2

For production environments, use PM2 for robust process management:

```bash
# Build TypeScript code
pnpm build

# Start daemon with PM2
pnpm pm2:start

# Check status
pnpm pm2:status

# View logs
pnpm pm2:logs

# Stop daemon
pnpm pm2:stop

# Restart daemon
pnpm pm2:restart
```

## Performance Optimizations

The system includes several optimizations for efficient operation:

1. **Headless Browser Mode**: All browser automation runs invisibly
2. **Resource Blocking**: Blocks images, CSS, analytics scripts, and other non-essential resources
3. **Browser Instance Reuse**: Shares a single browser instance across multiple parsers
4. **Memory Management**: Periodically restarts the browser to prevent memory leaks
5. **Parallel Processing**: Efficiently processes multiple news sources

These optimizations significantly reduce resource usage and improve parsing speed.

## Monitoring and Logs

All parsers output detailed logs to the console, including:

- Number of articles found
- Processing status
- Database operations
- Errors and warnings

Example log output:

```
🔄 Starting parsing cycle at 2023-04-01T12:00:00.000Z
📰 Parsing source: all
✅ Parsed 105 items from all
💾 Saved 105 items to database
📊 Generating analytics...
✅ Analytics updated successfully
✅ Parsing cycle completed in 45.32 seconds
⏰ Next cycle scheduled in 10 minutes
```

For more detailed debugging, check the output directory for:

- Screenshots of pages (when errors occur)
- Raw HTML content
- Structured JSON data

## Database Integration with NEON.tech

The system stores all parsed news in a PostgreSQL database hosted on NEON.tech.

### Database Schema

The main table is `NewsItem` with fields:

- `id`: Unique identifier
- `source`: News source name
- `url`: Article URL (unique)
- `title`: Article title
- `description`: Brief description
- `published_at`: Publication date
- `fetched_at`: When the article was fetched
- `category`: Article category
- `author`: Article author
- `content_type`: Type of content
- `full_content`: Complete article text
- `preview_content`: Preview of the article

### Testing the Database

To verify the database connection and see sample data:

```bash
pnpm test:db
```

This will retrieve and display the most recent news items from the database.

## Data Visualization and Analytics

The system includes built-in analytics capabilities to gain insights from the collected news data.

### Running Analytics

```bash
pnpm analyze
```

This generates JSON files in the `output/analytics/` directory with:

1. **Source Distribution**: Number of articles per news source
2. **Top Categories**: Most common article categories
3. **News Volume by Day**: Article count per day over time
4. **Trending Topics**: Most frequent words/topics in recent articles

### Viewing Analytics Results

The analytics results are saved as JSON files that can be:

- Imported into visualization tools like Tableau or Power BI
- Viewed directly in the browser or text editor
- Used as input for custom visualization scripts

Example analytics output:

```json
// output/analytics/trending_topics.json
[
  {"word": "bitcoin", "count": 143},
  {"word": "ethereum", "count": 87},
  {"word": "market", "count": 62},
  {"word": "regulation", "count": 45},
  ...
]
```

## Exporting Data

You can export the collected news data in various formats:

```bash
# Export recent news to JSON
pnpm cli export json --days 7 --output recent_news.json

# Export news from a specific source to CSV
pnpm cli export csv --source cointelegraph --output cointelegraph_news.csv
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**:

   - Verify your NEON.tech connection string in `.env`
   - Check if your IP is whitelisted in NEON.tech dashboard

2. **Parser Failures**:

   - Some websites may change their structure or block scrapers
   - Check the logs for specific error messages
   - Try running with the `--debug` flag for more information

3. **Missing Dependencies**:

   - Run `pnpm install` to ensure all dependencies are installed
   - For Playwright issues, run `npx playwright install` to update browsers

4. **Daemon Issues**:
   - If the daemon crashes, check `daemon.log` for error details
   - For memory issues, try reducing `MAX_BROWSER_LIFETIME` in `daemon.ts`
   - Ensure your system has enough resources for headless browsers

### Viewing Logs

All operations log to the console by default. For persistent logs:

```bash
# Save logs to a file
pnpm cli parse > parser_log.txt 2>&1

# View daemon logs
pnpm daemon:log
```

## Advanced Usage

### Adding a New Parser

1. Create a configuration file in `src/config/parsers/`
2. Implement a parser class in `src/parsers/`
3. Register the parser in `src/utils/parser-factory.ts`
4. Add a script to `package.json`

### Customizing Analytics

The analytics module can be extended in `src/services/analytics.ts` to add new types of analysis.

### Scheduling Regular Runs

Use a cron job or process manager like PM2 to schedule regular parsing:

```bash
# Example crontab entry (run daily at 6 AM)
0 6 * * * cd /path/to/project && pnpm parse
```

For continuous operation, use the daemon:

```bash
# Start daemon on system boot
pm2 startup
pnpm pm2:start
pm2 save
```

## Performance Considerations

- The system uses resource blocking and headless mode to improve performance
- Browser instance reuse significantly reduces memory usage
- Automatic browser restarts prevent memory leaks during long-running operations
- For large-scale parsing, consider distributing across multiple servers
- NEON.tech database scaling may be needed for high-volume operations

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

This project is licensed under the ISC License.
