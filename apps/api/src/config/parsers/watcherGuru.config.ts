export const watcherGuruConfig = {
  selectors: {
    newsContainer: ".cnvs-block-posts .cs-posts-area",
    newsItem: "article.post",
    title: ".cs-entry__title span",
    description: "", // Description is missing in the news list
    category: ".cs-meta-category ul.post-categories li a",
    author: ".cs-entry__author-meta a",
    date: ".cs-meta-date",
    link: ".cs-overlay-link",
    image: ".cs-overlay-background img",
    readingTime: ".cs-meta-reading-time",
    authorAvatar: ".cs-author-avatar img",
  },
  url: "https://watcher.guru/news/?c=2",
  articleSelectors: {
    content:
      "#primary.cs-content-area, .cs-entry__content-wrap, .entry-content",
    title: "h1.cs-entry__title span",
    subtitle: "", // Subtitle is missing
    author:
      ".cs-entry__author-meta a, .cs-entry__details-data .cs-entry__author-meta a",
    date: ".cs-meta-date, .cs-entry__post-meta .cs-meta-date",
    category: ".cs-meta-category a, .post-categories li a",
    tags: ".cs-entry__tags a, .cs-entry__tags ul li a",
    image: ".cs-entry__post-media img, figure.cs-entry__post-media img",
    imageCaption: "figcaption.cs-entry__caption-text, .wp-element-caption",
    paragraphs: ".entry-content p",
    headers: ".entry-content h2, .entry-content h3, .wp-block-heading",
    lists: ".entry-content ul, .entry-content ol",
    listItems: ".entry-content li",
    blockquotes: ".entry-content blockquote, .entry-content strong",
    embeddedTweets: ".twitter-tweet",
    readingTime: ".cs-meta-reading-time",
    imagesInContent: ".entry-content .wp-block-image img",
    imageCaptionsInContent: ".entry-content .wp-element-caption",
    relatedLinks: ".entry-content a[href*='watcher.guru']",
    shareButtons: ".pk-share-buttons-wrap, .pk-share-buttons-items",
  },
};
