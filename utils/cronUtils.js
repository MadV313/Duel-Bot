// utils/cronUtils.js
//
// Enhanced cron utility — safe, centralized scheduler for routine maintenance.
// Keeps your existing logic, adds error isolation, dynamic toggles, and job registry.
//

import cron from 'node-cron';

/** internal registry of active jobs for debugging */
const jobs = {};

/**
 * 🧩 Register a cron job safely
 * @param {string} name  - unique job name (used in logs)
 * @param {string} spec  - cron pattern, e.g. '0 0 * * *'
 * @param {Function} fn  - async or sync task
 */
function registerJob(name, spec, fn) {
  try {
    if (!cron.validate(spec)) {
      console.error(`❌ [Cron] Invalid schedule for ${name}: "${spec}"`);
      return;
    }
    const job = cron.schedule(spec, async () => {
      const start = new Date();
      console.log(`🕒 [Cron] ${name} started at ${start.toISOString()}`);
      try {
        await Promise.resolve(fn());
        console.log(`✅ [Cron] ${name} completed (${(Date.now() - start.getTime())}ms)`);
      } catch (err) {
        console.error(`💥 [Cron] ${name} failed:`, err);
      }
    });
    jobs[name] = job;
  } catch (e) {
    console.error(`❌ [Cron] Failed to register job "${name}":`, e);
  }
}

/**
 * Initialize all cron jobs for the system.
 * Uses env toggles so you can disable in dev or staging.
 */
export function initializeCronJobs() {
  const enable = String(process.env.ENABLE_CRON_JOBS || 'true').toLowerCase() === 'true';
  if (!enable) {
    console.log('⚙️ [Cron] Scheduler disabled by env (ENABLE_CRON_JOBS=false).');
    return;
  }

  // 🕛 Daily reset at midnight (server time)
  registerJob('Daily Reset', '0 0 * * *', () => {
    console.log('🕛 [Cron] Daily reset task triggered...');
    // TODO: Add real reset logic here (e.g. clearing temp files, resetting limits)
  });

  // 🔄 Example 30-minute heartbeat (toggle with env)
  if (String(process.env.ENABLE_HEARTBEAT || 'false').toLowerCase() === 'true') {
    registerJob('Heartbeat', '*/30 * * * *', () => {
      console.log('[Cron] 🔄 30-minute heartbeat check-in...');
    });
  }

  console.log(`✅ [Cron] Scheduled ${Object.keys(jobs).length} job(s) initialized.`);
}

/**
 * Stop all active cron jobs (useful for graceful shutdowns).
 */
export function stopCronJobs() {
  for (const [name, job] of Object.entries(jobs)) {
    try {
      job.stop();
      console.log(`🛑 [Cron] ${name} stopped.`);
    } catch (err) {
      console.warn(`⚠️ [Cron] Could not stop ${name}:`, err.message);
    }
  }
}

/**
 * List currently registered cron jobs.
 * @returns {string[]} job names
 */
export function listCronJobs() {
  return Object.keys(jobs);
}
