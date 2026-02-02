module.exports = {
  apps: [
    {
      name: 'habitrush-api',
      script: 'dist/app.js',
      cwd: __dirname,

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },

      // Instances (use 1 for cron jobs to avoid duplicate execution)
      instances: 1,
      exec_mode: 'fork',

      // Auto-restart
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Restart delay on crash (5 seconds)
      restart_delay: 5000,

      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,

      // Max restarts in a time window
      max_restarts: 10,
      min_uptime: '10s',

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_type: 'json',

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Wait for ready signal
      wait_ready: false,

      // Source maps for better stack traces
      source_map_support: true,
    },
  ],

  // Deployment configuration (optional - for remote deployments)
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/master',
      repo: 'git@github.com:your-username/habitrush-back.git',
      path: '/var/www/habitrush',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
