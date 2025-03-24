export const bitcoinComConfig = {
  selectors: {
    newsContainer: ".sc-htSjYp, .sc-cYxCiX, .sc-fGGoSf",
    newsItem: ".sc-jbVRWv, .sc-eXGYID, .sc-bCgkFR",
    title: ".sc-hpRSGa, .sc-BoTHd, h5, h6",
    description: ".sc-eZiHJD, p",
    category: ".category, .tag",
    author: ".author, .byline",
    date: ".sc-wrHXg",
    link: ".sc-hnwOTO",
    image: "img",
  },
  url: "https://news.bitcoin.com/category/crypto-news/",
  articleSelectors: {
    content: ".article__body",
    title: "h1, .article__title",
    subtitle: "h2, .subtitle",
    author: ".article__author-name",
    date: "time.article__date",
    tags: ".article__tags a",
  },
};
