export const theBlockConfig = {
  selectors: {
    newsContainer: "main, .content-wrapper, .articles-wrapper",
    newsItem: "article, .article, .post",
    title: "h2, h3, .title, .headline",
    description: "p, .description, .excerpt, .summary",
    category: ".category, .tag, .topic",
    author: ".author, .byline",
    date: "time, .date, .timestamp",
    link: "a[href]",
    image: "img",
  },
  url: "https://www.theblock.co/latest",
  articleSelectors: {
    content: ".article-content, .post-content, .entry-content, article",
    title: "h1, .article-title, .post-title",
    subtitle: "h2, .subtitle, .description",
    author: ".author, .byline",
    date: "time, .date, .timestamp",
    tags: ".tags a, .topics a",
  },
};
