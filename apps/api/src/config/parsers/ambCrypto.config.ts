export const ambCryptoConfig = {
  selectors: {
    newsContainer: ".main-content, .content-area, main, .articles-container",
    newsItem: "article, .post, .article, .news-item, .card",
    title: "h2, h3, .title, .entry-title, [class*='title']",
    description:
      "p, .excerpt, .description, [class*='excerpt'], [class*='description']",
    category: ".category, .tag, [class*='category'], [class*='tag']",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, [datetime], [class*='date'], [class*='time']",
    link: "a[href]",
    image: "img, [class*='image'], [class*='img']",
  },
  url: "https://ambcrypto.com/category/new-news/",
  articleSelectors: {
    content:
      ".entry-content, .article-content, .post-content, article, .content",
    title: "h1, .entry-title, .article-title, .post-title, [class*='title']",
    subtitle:
      "h2, .subtitle, .description, [class*='subtitle'], [class*='description']",
    author: ".author, .byline, [class*='author'], [class*='byline']",
    date: "time, .date, [datetime], [class*='date'], [class*='time']",
    tags: ".tags a, .topics a, .categories a, [class*='tag'] a, [class*='topic'] a",
  },
};
