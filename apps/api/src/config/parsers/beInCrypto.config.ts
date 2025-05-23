export const beInCryptoConfig = {
  selectors: {
    newsContainer: ".flex.flex-col.gap-y-6, .flex.flex-wrap.-mx-3",
    newsItem: "[data-el='bic-c-news-big'], .flex.flex-col.gap-y-2.pb-6",
    title: "h5 a, h3.font-bold",
    description: ".text-sm.text-gray-500, p.mb-2",
    category:
      "a[href*='/markets/'], a[href*='/analysis/'], .whitespace-nowrap.hover\\:underline",
    author: "[data-el='bic-author-meta'] a, .text-xs.text-gray-500 a",
    date: "time.date, time.ago, time",
    link: "h5 a, a.block, a.hover\\:no-underline",
    image: "img.object-cover, img.w-full",
    readingTime:
      "[data-el='bic-reading-time'], .inline-flex.items-center span.font-normal",
    contentType: "[data-el='bic-article-type'], .tpw",
  },
  url: "https://beincrypto.com/news/",
  articleSelectors: {
    content: ".entry-content-inner",
    title: "h1.text-3xl",
    subtitle: ".text-xl.text-gray-700",
    author: "[data-el='bic-author-meta'] a",
    date: "[data-el='bic-author-meta'] time",
    category: ".flex.flex-wrap.gap-x-3 a",
    tags: ".flex.flex-wrap.gap-x-3 a",
    image: ".featured-images img",
    imageCaption: ".wp-element-caption",
    briefPoints: ".in-brief-block__row",
    paragraphs: ".entry-content-inner p",
    headers: ".entry-content-inner h2, .entry-content-inner h3",
    lists: ".entry-content-inner ul, .entry-content-inner ol",
    blockquotes: ".entry-content-inner blockquote",
    figures: ".entry-content-inner figure",
    readingTime: "[data-el='bic-reading-time']",
    disclaimer: ".disclaimer",
  },
};
