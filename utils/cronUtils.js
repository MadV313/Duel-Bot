// utils/cronUtils.js

import cron from 'node-cron';

/**
 * Schedule system-level cron jobs (e.g. daily resets, log rotation).
 * You can add more cron jobs inside this module as needed.
 */
export function initializeCronJobs() {
  // 🕛 Daily reset at midnight (server time)
  cron.schedule('0 0 * * *', () => {
    console.log('🕛 [Cron] Daily reset task triggered...');
    // TODO: Add real reset logic here (e.g. clearing temp files, resetting limits)
  });

  // 🔄 Example: Add other jobs here as needed
  // cron.schedule('*/30 * * * *', () => {
  //   console.log('[Cron] Every 30 minutes check-in...');
  // });
  
  console.log('✅ [Cron] Scheduled jobs initialized.');
}
