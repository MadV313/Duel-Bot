// commands/index.js

import fs from 'fs';
import accept from './accept.js';
import buycard from './buycard.js';
import challenge from './challenge.js';
import clear from './clear.js';
import coin from './coin.js';
import deny from './deny.js';
import discard from './discard.js';
import forfeit from './forfeit.js';
import givecard from './givecard.js';
import leave from './leave.js';
import linkdeck from './linkdeck.js';
import practice from './practice.js';
import rules from './rules.js';
import save from './save.js';
import sellcard from './sellcard.js';
import takecard from './takecard.js';
import victory from './victory.js';
import viewdeck from './viewdeck.js';
import viewlog from './viewlog.js';
import watch from './watch.js';

// ✅ Ensure slash commands are registered once
const flagPath = './.commands_registered';
if (!fs.existsSync(flagPath)) {
  const { default: register } = await import('../registerCommands.js');
  await register();
  fs.writeFileSync(flagPath, 'done');
}

// ✅ Export all commands
export default [
  accept,
  buycard,
  challenge,
  clear,
  coin,
  deny,
  discard,
  forfeit,
  givecard,
  leave,
  linkdeck,
  practice,
  rules,
  save,
  sellcard,
  takecard,
  victory,
  viewdeck,
  viewlog,
  watch
];
