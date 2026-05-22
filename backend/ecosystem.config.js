/**
 * PM2 ecosystem file — defines how the backend process is managed.
 *
 * WHY this file instead of `pm2 start dist/server.js`:
 * - `cwd` ensures relative paths in .env (like ./keys/private.pem) resolve correctly
 * - `autorestart` brings the server back if it crashes
 * - `max_memory_restart` prevents a memory leak from consuming the whole EC2 instance
 * - Having this in source control means deployment is always consistent
 */
module.exports = {
  apps: [
    {
      name: "newnopdesk-api",
      script: "dist/server.js",

      // Working directory — dotenv and RSA key paths are relative to this
      cwd: "/var/www/newnopdesk/backend",

      instances: 1,
      exec_mode: "fork",

      // Restart the process if it crashes
      autorestart: true,
      watch: false,

      // If memory exceeds 256MB, restart the process
      // A t3.micro has 1GB RAM — this leaves plenty for the OS and MySQL client
      max_memory_restart: "256M",

      // Log file locations
      out_file: "/var/log/newnopdesk/api-out.log",
      error_file: "/var/log/newnopdesk/api-error.log",
      merge_logs: true,

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
