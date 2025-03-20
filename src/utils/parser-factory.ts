import { NewsItem } from "../types/news";
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

export type SiteName =
  | "cryptonews"
  | "cointelegraph"
  | "coindesk"
  | "decrypt"
  | "theblock"
  | "ambcrypto"
  | "bitcoinmagazine"
  | "bitcoincom"
  | "beincrypto"
  | "watcherguru"
  | "cryptoslate"
  | "all";

// Parser factory
export class ParserFactory {
  private static parsers = {
    cryptonews: new CryptoNewsParser(),
    cointelegraph: new CoinTelegraphParser(),
    coindesk: new CoinDeskParser(),
    decrypt: new DecryptParser(),
    theblock: new TheBlockParser(),
    ambcrypto: new AMBCryptoParser(),
    bitcoinmagazine: new BitcoinMagazineParser(),
    bitcoincom: new BitcoinComParser(),
    beincrypto: new BeInCryptoParser(),
    watcherguru: new WatcherGuruParser(),
    cryptoslate: new CryptoSlateParser(),
  };

  // Method to get a parser by site name
  static getParser(site: SiteName) {
    if (site === "all") {
      return Object.values(this.parsers);
    }
    const parser = this.parsers[site];
    if (!parser) {
      throw new Error(`Parser for site "${site}" not found`);
    }
    return [parser];
  }

  // Method to get all available parsers
  static getAllParsers(): Array<{
    name: SiteName;
    parser: () => Promise<NewsItem[]>;
  }> {
    return [
      {
        name: "cryptonews",
        parser: () => this.getParser("cryptonews")[0].parse(),
      },
      {
        name: "cointelegraph",
        parser: () => this.getParser("cointelegraph")[0].parse(),
      },
      { name: "coindesk", parser: () => this.getParser("coindesk")[0].parse() },
      { name: "decrypt", parser: () => this.getParser("decrypt")[0].parse() },
      { name: "theblock", parser: () => this.getParser("theblock")[0].parse() },
      {
        name: "ambcrypto",
        parser: () => this.getParser("ambcrypto")[0].parse(),
      },
      {
        name: "bitcoinmagazine",
        parser: () => this.getParser("bitcoinmagazine")[0].parse(),
      },
      {
        name: "bitcoincom",
        parser: () => this.getParser("bitcoincom")[0].parse(),
      },
    ];
  }

  // Method to run a parser and save the results
  static async runParser(siteName: SiteName): Promise<NewsItem[]> {
    const parsers = this.getParser(siteName);
    const results: NewsItem[] = [];

    for (const parser of parsers) {
      try {
        const items = await parser.parse();
        results.push(...items);
      } catch (error) {
        console.error(`Error parsing ${parser.constructor.name}:`, error);
      }
    }

    return results;
  }
}
