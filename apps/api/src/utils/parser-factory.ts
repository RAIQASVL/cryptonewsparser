import {
  NewsItem,
  SiteName,
  ALL_SITE_NAMES_ARRAY,
} from "@cryptonewsparser/shared";
import { CryptoNewsParser } from "../parsers/cryptoNews";
import { CoinTelegraphParser } from "../parsers/coinTelegraph";
import { CoinDeskParser } from "../parsers/coinDesk";
import { DecryptParser } from "../parsers/decrypt";
import { TheBlockParser } from "../parsers/theBlock";
import { AMBCryptoParser } from "../parsers/ambCrypto";
import { BitcoinMagazineParser } from "../parsers/bitcoinMagazine";
import { BitcoinComParser } from "../parsers/bitcoinCom";
import { BeInCryptoParser } from "../parsers/beInCrypto";
import { WatcherGuruParser } from "../parsers/watcherGuru";
import { CryptoSlateParser } from "../parsers/cryptoSlate";
import { Browser } from "playwright";
import { logger as defaultLogger, Logger } from "./logger";
import { BaseParser } from "../parsers/BaseParser";

export const ALL_SITE_NAMES = ALL_SITE_NAMES_ARRAY;

export interface ParserOptions {
  headless?: boolean;
  browser?: Browser;
  logger?: Logger;
}

export class ParserFactory {
  static async runParser(
    site: SiteName,
    options: ParserOptions = {}
  ): Promise<NewsItem[]> {
    const logger = options.logger || defaultLogger;
    const headless = options.headless ?? true;
    const browser = options.browser;

    const factoryContext = "ParserFactory";
    logger.debug(`Request to run parser for "${site}"`, factoryContext);

    let parser: BaseParser;

    try {
      switch (site) {
        case "cointelegraph":
          parser = new CoinTelegraphParser({ logger, headless, browser });
          break;
        case "coindesk":
          parser = new CoinDeskParser({ logger, headless, browser });
          break;
        case "cryptonews":
          parser = new CryptoNewsParser({ logger, headless, browser });
          break;
        case "decrypt":
          parser = new DecryptParser({ logger, headless, browser });
          break;
        case "theblock":
          parser = new TheBlockParser({ logger, headless, browser });
          break;
        case "ambcrypto":
          parser = new AMBCryptoParser({ logger, headless, browser });
          break;
        case "bitcoinmagazine":
          parser = new BitcoinMagazineParser({ logger, headless, browser });
          break;
        case "bitcoincom":
          parser = new BitcoinComParser({ logger, headless, browser });
          break;
        case "beincrypto":
          parser = new BeInCryptoParser({ logger, headless, browser });
          break;
        case "watcherguru":
          parser = new WatcherGuruParser({ logger, headless, browser });
          break;
        case "cryptoslate":
          parser = new CryptoSlateParser({ logger, headless, browser });
          break;
        default:
          logger.error(
            `Unknown parser site requested: ${site}`,
            factoryContext
          );
          throw new Error(`Parser for site "${site}" not found.`);
      }
    } catch (error) {
      logger.error(
        `Failed to instantiate parser for site "${site}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        factoryContext
      );
      throw error;
    }

    try {
      logger.info(`Starting parsing process for "${site}"...`, factoryContext);
      const results = await parser.parse();
      logger.info(
        `Parser "${site}" finished successfully. Found ${results.length} items.`,
        factoryContext
      );
      return results;
    } catch (error) {
      logger.error(
        `Parser "${site}" failed during execution: ${
          error instanceof Error ? error.message : String(error)
        }`,
        factoryContext
      );
      throw error;
    }
  }
}
