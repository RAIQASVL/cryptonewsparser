export const coinDeskConfig = {
  selectors: {
    newsContainer: "main, .at-content-wrapper, .content-wrapper, body",
    newsItem: "article, .article, .story, .news-item, a[href*='/']",
    title: "h2, h3, .headline, .title, a",
    description: ".description, .excerpt, .summary, p",
    category: ".category, .tag, [class*='category'], [class*='tag']",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, .timestamp, [class*='date'], [class*='time']",
    link: "a[href]",
    image: "img, [class*='image']",
  },
  url: "https://www.coindesk.com/latest-crypto-news",
  articleSelectors: {
    content: "article, .article-content, .article-body, .content, main",
    title: "h1, .article-title, .title",
    subtitle: "h2, .subtitle, .description, .excerpt",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, [class*='date'], [class*='time']",
    tags: ".tags a, [class*='tag'] a, a[href*='tag']",
  },
};
