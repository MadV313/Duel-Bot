// Read-only preflight for the private SV13 storage service. Never prints secrets or player data.
import 'dotenv/config';
const base = String(process.env.PERSISTENT_DATA_URL || '').trim().replace(/\/+$/, '');
const key = String(process.env.STORAGE_KEY || '');
if (!base || !key) {
  console.error('FAIL: Duel Bot requires both PERSISTENT_DATA_URL and STORAGE_KEY in Railway Variables.');
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const url = new URL('data/linked_decks.json', base + '/');
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Storage URL must use HTTP(S)');
    const response = await fetch(url, { headers: { 'X-Storage-Key': key, 'Cache-Control': 'no-store' }, signal: controller.signal });
    if (response.status === 200) console.log('PASS: authenticated read of data/linked_decks.json succeeded. /challenge storage access is available.');
    else if (response.status === 403 || response.status === 401) {
      console.error('FAIL: storage rejected authentication (HTTP ' + response.status + '). Set Duel Bot STORAGE_KEY to exactly the same value as sv13-tcg-data STORAGE_KEY, then redeploy Duel Bot. Check PERSISTENT_DATA_URL targets that storage service.');
      process.exitCode = 1;
    } else if (response.status === 404) {
      console.error('FAIL: authenticated access succeeded but linked_decks.json is absent (404). Check correct storage service and persistent volume. DO NOT initialize or overwrite player data.');
      process.exitCode = 1;
    } else {
      console.error('FAIL: storage returned HTTP ' + response.status + '. Check storage deployment and Railway logs.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('FAIL: unable to reach storage (' + (error.name === 'AbortError' ? 'timeout' : 'network or URL error') + '). Verify PERSISTENT_DATA_URL and Railway service networking.');
    process.exitCode = 1;
  } finally { clearTimeout(timeout); }
}
