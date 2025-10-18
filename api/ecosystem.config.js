module.exports = {
  apps: [
    {
      name: "elixpo_art_backend",
      script: "elixpo_art.js",
      instances: "max", // Uses all available CPU cores
      exec_mode: "cluster", // Runs app in cluster mode for load balancing

      // Environment-specific settings
      env: {
        NODE_ENV: "production",
        PORT: 3000, // Default port, can be overridden in the deployment environment
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3001,
        DEBUG: "true", // Enable debugging mode in development
      },
      env_test: {
        NODE_ENV: "test",
        PORT: 3002,
      },

      // Memory and restart options
      max_memory_restart: "1G", // Automatically restart the app if it exceeds 1GB of memory usage

      // Enable graceful restart and zero-downtime deployment
      watch: false, // Disabling watch mode as we do not want to restart on code changes in production
      merge_logs: true, // Merges logs from different instances into one file

      // Log configuration
      error_file: "./logs/err.log", // Error logs location
      out_file: "./logs/out.log",  // Output logs location
      log_date_format: "YYYY-MM-DD HH:mm Z", // Log timestamps

      // Custom PM2 settings for deployment
      autorestart: true, // Automatically restart app on crash
      restart_delay: 5000, // Delay before restarting after crash (in ms)
    },
  ],
};
