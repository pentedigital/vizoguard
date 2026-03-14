module.exports = {
  apps: [{
    name: "vizoguard-api",
    script: "app.js",
    cwd: "/var/www/vizoguard/server",
    instances: 1,
    max_memory_restart: "256M",
    env: {
      NODE_ENV: "production",
    },
    error_file: "/var/www/vizoguard/data/logs/error.log",
    out_file: "/var/www/vizoguard/data/logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    merge_logs: true,
  }],
};
