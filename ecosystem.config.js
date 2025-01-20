module.exports = {
  apps: [{
    name: "CryptoNewsParser",
    script: "./dist/index.js",
    env: {
      NODE_ENV: "production",
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_memory_restart: "1G",
    env_file: ".env"
  }]
} 