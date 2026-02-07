module.exports = {
  apps: [
    {
      name: "elixpo_art_backend",
      script: "api/elixpo_art.js",     
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3005,                  
        DEBUG: "true"
      },
      env_test: {
        NODE_ENV: "test",
        PORT: 3002
      },
      max_memory_restart: "1G",
      watch: false,
      merge_logs: true,
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      autorestart: true,
      restart_delay: 5000
    }
  ]
};