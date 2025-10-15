// routes/collection.js
//
// Returns a player's collection enriched with master metadata.
// Mounted at: app.use('/collection', collectionRoute)
// -> Final path: GET /collection?userId=<id>   (or)  GET /collection?token=<token>
//
// Notes (updates):
//  • Adds Cache-Control: no-store on responses
//  • Returns BOTH `filename` (sanitized local file name) AND `image` (raw from master; can be absolute URL)
//  • Keeps existing shape otherwise: [{ number:"001", owned:2, name, rarity, type, image, filename }, ...]

import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  getPlayerCollection,        // => [{ number: "001", owned: 2 }, ...]
  resolveUserIdByToken,       // token -> userId
} from '../utils/deckUtils.js';

const router = express.Router();

/* ---------------- master list ---------------- */
// Source of truth for card metadata
const masterListPath = path.resolve('logic', 'CoreMasterReference.json');
let masterList = [];
try {
  const raw = fs.readFileSync(masterListPath, 'utf8');
  const parsed = JSON.parse(raw);
  masterList = Array.isArray(parsed) ? parsed : (parsed.cards || []);
} catch (e) {
  console.warn(`[collection] Failed to load ${masterListPath}: ${e?.message}`);
  masterList = [];
}

function pad3(n) { return String(n).padStart(3, '0'); }

// Keep letters, numbers, dot, dash, underscore and strip directories
function sanitizeFile(s) {
  const base = path.basename(String(s || ''));
  return base.replace(/[^a-zA-Z0-9._-]/g, '');
}

function synthesizeFilename(card) {
  const id = pad3(card.card_id ?? card.number ?? '');
  const name = sanitizeFile(card.name || 'Card');
  const type = sanitizeFile(card.type || 'Unknown');
  return `${id}_${name}_${type}.png`;
}

function findMasterById(id3) {
  // Try common shapes: card_id (preferred), number, cardId
  return masterList.find(c =>
    pad3(c.card_id ?? '') === id3 ||
    pad3(c.number  ?? '') === id3 ||
    pad3(c.cardId  ?? '') === id3
  );
}

/**
 * GET /
 * Params:
 *   - userId=<discordId>
 *   - OR token=<playerToken>  (preferred for privacy; resolves to userId)
 *
 * Returns: [{ number: "001", owned: 2, name, rarity, type, image, filename }, ...]
 */
router.get('/', async (req, res) => {
  try {
    const { userId: rawUserId, token } = req.query || {};
    let userId = rawUserId;

    if (!userId && token) {
      userId = await resolveUserIdByToken(String(token));
      if (!userId) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'Invalid token' });
      }
    }

    if (!userId) {
      res.set('Cache-Control', 'no-store');
      return res.status(400).json({ error: 'Missing userId or token' });
    }

    // Legacy util returns array of { number, owned }
    const collectionArr = await getPlayerCollection(String(userId));

    // If nothing, reply empty array (not 404)
    if (!Array.isArray(collectionArr) || collectionArr.length === 0) {
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }

    // Enrich from master
    const enriched = collectionArr
      .filter(row => row && row.number && pad3(row.number) !== '000')
      .map(row => {
        const id3  = pad3(row.number);
        const meta = findMasterById(id3) || {};

        // Prefer explicit file reference from master (image or filename). Keep raw as `image`
        const fileFromMaster = meta.image || meta.filename || '';
        const filename = fileFromMaster
          ? sanitizeFile(fileFromMaster)            // local-friendly filename (no directories)
          : synthesizeFilename({
              card_id: id3,
              name: meta.name,
              type: meta.type
            });

        return {
          number: id3,
          owned: Number(row.owned) || 0,
          name: meta.name || `Card ${id3}`,
          rarity: meta.rarity || 'Common',
          type: meta.type || 'Unknown',
          image: fileFromMaster || filename, // raw pointer (may be absolute URL) – kept for compatibility
          filename                             // sanitized local filename your FE expects
        };
      })
      .sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));

    res.set('Cache-Control', 'no-store');
    return res.json(enriched);
  } catch (e) {
    console.error('[collection] GET / error:', e);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
