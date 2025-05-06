// utils/cronUtils.js

import cron from 'node-cron';

// Schedule a daily task (reset system, clean logs, etc.)
cron.schedule('0 0 * * *', () => {
  console.log('Daily reset task running...');
  // Add your reset logic here
});
