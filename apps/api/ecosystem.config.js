module.exports = {
  apps: [
    {
      name: "crypto-news-daemon",
      script: "dist/scripts/daemon.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
}; 