export const decryptConfig = {
  selectors: {
    newsContainer:
      "main, .content-wrapper, .articles-wrapper, .posts-container",
    newsItem: "article, .article, .post, .card, .news-item",
    title: "h2, h3, .title, .headline, [class*='title']",
    description: "p, .description, .excerpt, .summary, [class*='description']",
    category: ".category, .tag, .topic, [class*='category'], [class*='tag']",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, .timestamp, [datetime], [class*='date'], [class*='time']",
    link: "a[href]",
    image: "img, [class*='image'], [class*='img']",
  },
  url: "https://decrypt.co/news/cryptocurrencies",
  articleSelectors: {
    content:
      ".article-content, .post-content, .entry-content, article, .content",
    title: "h1, .article-title, .post-title, .headline, [class*='title']",
    subtitle:
      "h2, .subtitle, .description, .excerpt, [class*='subtitle'], [class*='description']",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, .timestamp, [datetime], [class*='date'], [class*='time']",
    tags: ".tags a, .topics a, .categories a, [class*='tag'] a, [class*='topic'] a",
  },
};
