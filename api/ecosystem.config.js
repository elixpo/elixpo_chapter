module.exports = {
  apps: [
    {
      name: "elixpo_art_backend",
      script: "elixpo_art.js",
      instances: "max", // For horizontal scaling, use max to utilize all CPU cores
      exec_mode: "cluster", // Cluster mode for load balancing
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
