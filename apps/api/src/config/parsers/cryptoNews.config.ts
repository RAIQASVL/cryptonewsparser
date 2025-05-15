export const cryptoNewsConfig = {
  selectors: {
    newsContainer: ".archive-template-latest-news-list",
    newsItem: ".archive-template-latest-news__item",
    title: ".archive-template-latest-news__title",
    description: ".archive-template-latest-news__text",
    category: ".archive-template-latest-news__category",
    date: ".archive-template-latest-news__time",
    link: "a.archive-template-latest-news__link",
    image: ".archive-template-latest-news__bg",
  },
  url: "https://cryptonews.com/news/",
  articleSelectors: {
    content: ".article-single__content",
    title: "h1",
    subtitle: ".article-single__lead",
    author: ".article-single__author-link",
    date: ".article-single__date",
  },
};
