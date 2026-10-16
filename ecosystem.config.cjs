const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'my-savings-api',
      cwd: path.join(__dirname, 'apps/api'),
      script: 'dist/index.js',
      interpreter: process.execPath,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
