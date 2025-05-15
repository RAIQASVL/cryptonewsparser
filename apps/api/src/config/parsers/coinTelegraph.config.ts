import { ParserConfig } from "../../parsers/BaseParser";

export const coinTelegraphConfig: ParserConfig = {
  url: "https://cointelegraph.com/tags/cryptocurrencies",
  selectors: {
    newsContainer: ".posts-listing__list",
    newsItem: ".post-card-inline",
    title: ".post-card-inline__title",
    description: ".post-card-inline__text",
    category: ".post-card-inline__badge",
    author: ".post-card-inline__author",
    date: "time",
    link: "a.post-card-inline__title-link",
    image: ".lazy-image__img",
  },
  articleSelectors: {
    content: ".post-content",
    title: "h1.post__title, h1.post-title",
    subtitle: ".post__lead, .post-lead",
    author: ".post-meta__author-name, .post-author",
    date: ".post-meta__publish-date, .post-date",
    tags: ".tags-list__item",
  },
};
