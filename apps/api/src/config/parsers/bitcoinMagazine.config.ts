export const bitcoinMagazineConfig = {
  selectors: {
    newsContainer: "#tdi_52.td_block_inner.td-mc1-wrap",
    newsItem:
      ".td_module_flex.td_module_flex_1.td_module_wrap.td-animation-stack.td-cpt-post",
    title: ".entry-title.td-module-title a",
    description: ".td-excerpt",
    category: ".td-post-category",
    author: ".td-post-author-name a",
    date: ".td-post-date time",
    link: ".entry-title.td-module-title a[href]",
    image: ".td-module-thumb .entry-thumb",
    videoIndicator: ".td-video-play-ico",
    videoDuration: ".td-post-vid-time",
  },
  url: "https://bitcoinmagazine.com/articles",
  articleSelectors: {
    content: ".tdb_single_content .tdb-block-inner",
    title: "h1.tdb-title-text",
    subtitle: ".tdb_single_subtitle p",
    author: ".tdb-author-name",
    date: ".tdb_single_date time",
    category: ".tdb-category .tdb-entry-category",
    tags: ".tdb_single_tags .tdb-tags a",
    image: ".tdb_single_featured_image img",
    paragraphs: ".tdb_single_content p",
    headers: ".tdb_single_content h2, .tdb_single_content h3",
    lists: ".tdb_single_content ul, .tdb_single_content ol",
    blockquotes: ".tdb_single_content blockquote",
    authorBox: ".tdb-author-box",
    relatedPosts: ".td_block_related_posts",
  },
};
