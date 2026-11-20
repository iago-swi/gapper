// Shared high-score list for GAPPER // PRISM: a Cloudflare Worker in front of a D1 (SQLite) database.
//
//   GET  /                     ->  { top: [{ n, s, w, d }] }
//   POST /  body { k, n, s, w } ->  { top: [{ n, s, w, d, me? }], rank }
//
// n = initials (up to 3 uppercase letters/digits), s = score, w = sector reached (1..6),
// d = UTC date (YYYY-MM-DD), k = 32-char lowercase hex key generated per finished run.
// Sending the same k again updates only the initials of that row, never adding a duplicate.
// k is never returned in responses.
//
// Stored per run: key, initials, score, sector, UTC date, timestamp. Nothing else:
// no IP address and no browser details.

const TOP = 10;         // rows returned in top list
const KEEP = 200;       // best rows retained in database
const PER_MINUTE = 30;  // max new entries accepted per minute across all players

// Score bounds derived directly from js/levels.js and js/game.js:
// - Every scoring event in GAPPER // PRISM is a multiple of 5:
//     * Complete conduit edge:   +15
//     * Seal chamber:            (100 + w*h*20) * combo(1..8) * multiBonus(1..2)  [multiple of 20]
//     * Seeker blocked by Gap:   +150
//     * Seeker trapped by Gaps:  +500
//     * Data Shard pickup:       +300
//     * Overdrive Seeker shatter:+400 * killIndex (400, 800, 1200, ...)
//     * Sector clear bonus:      1000 + (sector - 1) * 500
// - The 6 sectors have exact [edgeCount, sum(100 + cellArea*20), clearBonus]:
//     Sector 1 (10x6, 12 cells): [35, 2400, 1000]
//     Sector 2 (12x6, 14 cells): [43, 2840, 1500]
//     Sector 3 (12x8, 18 cells): [58, 3560, 2000]
//     Sector 4 (12x8, 17 cells): [48, 3620, 2500]
//     Sector 5 (14x8, 16 cells): [55, 3680, 3000]
//     Sector 6 (14x8, 20 cells): [60, 4240, 3500]
// - Because the title screen lets players start on any sector 1..6, the minimum
//   possible positive score when ending in sector w is 15 (one traced conduit edge).
// - Per-sector upper bound sums:
//     * edges * 15                    (all conduits painted)
//     * cellBaseSum * 8 * 2           (max x8 combo and x2 double-seal on every chamber)
//     * clearBonus                    (sector clear bonus)
//     * 25000                         (generous cap for Gap blocks/traps, shards, and Overdrive shatters)
// - Because clearing Sector 6 loops back to Sector 1, the upper bound allows up to
//   3 full extra 6-sector loops beyond the sectors 1..w.
const SECTORS = [
  [35, 2400, 1000],
  [43, 2840, 1500],
  [58, 3560, 2000],
  [48, 3620, 2500],
  [55, 3680, 3000],
  [60, 4240, 3500]
];
const COMBAT_SHARD_CAP_PER_SECTOR = 25000;
const MAX_EXTRA_LOOPS = 3;

function sectorMax(idx) {
  const [edges, cellBaseSum, clearBonus] = SECTORS[idx];
  return edges * 15 + cellBaseSum * 8 * 2 + clearBonus + COMBAT_SHARD_CAP_PER_SECTOR;
}

const ONE_LOOP_MAX = SECTORS.reduce((acc, _, i) => acc + sectorMax(i), 0);

function prismScoreRange(w) {
  const min = 15;
  let prefixMax = 0;
  for (let i = 0; i < w; i++) {
    prefixMax += sectorMax(i);
  }
  const max = prefixMax + MAX_EXTRA_LOOPS * ONE_LOOP_MAX;
  return [min, max];
}

function isValidPrismRun(s, w) {
  if (!Number.isInteger(w) || w < 1 || w > SECTORS.length) return false;
  if (!Number.isInteger(s) || s <= 0 || s % 5 !== 0) return false;
  const [min, max] = prismScoreRange(w);
  return s >= min && s <= max;
}

const HEAD = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEAD });
const cleanInitials = (v) => (String(v ?? '').toUpperCase().match(/[\p{L}\p{N}]/gu) || []).slice(0, 3).join('');

async function getTop(db, meId) {
  const { results } = await db
    .prepare('SELECT id, n, s, w, d FROM scores ORDER BY s DESC, id ASC LIMIT ?1')
    .bind(TOP)
    .all();
  return results.map((r) =>
    r.id === meId
      ? { n: r.n, s: r.s, w: r.w, d: r.d, me: true }
      : { n: r.n, s: r.s, w: r.w, d: r.d }
  );
}

async function handle(req, db) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...HEAD,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (req.method === 'GET') {
    return reply({ top: await getTop(db, -1) });
  }

  if (req.method !== 'POST') {
    return reply({ error: 'method not allowed' }, 405);
  }

  const text = await req.text();
  if (text.length > 400) return reply({ error: 'too long' }, 413);

  let b;
  try {
    b = JSON.parse(text);
  } catch (_) {
    return reply({ error: 'not JSON' }, 400);
  }

  const valid =
    b &&
    typeof b === 'object' &&
    typeof b.k === 'string' &&
    /^[0-9a-f]{32}$/.test(b.k) &&
    isValidPrismRun(b.s, b.w);

  if (!valid) return reply({ error: 'not a valid run' }, 422);

  const n = cleanInitials(b.n);
  const now = Date.now();
  let row = await db.prepare('SELECT id, s FROM scores WHERE k = ?1').bind(b.k).first();

  if (row) {
    // Same key updates initials only; never creates a duplicate or hits rate limit
    await db.prepare('UPDATE scores SET n = ?1 WHERE id = ?2').bind(n, row.id).run();
  } else {
    const recent = await db
      .prepare('SELECT COUNT(*) AS c FROM scores WHERE t > ?1')
      .bind(now - 60000)
      .first();
    if (recent && recent.c >= PER_MINUTE) {
      return reply({ error: 'too many new scores, try again in a minute' }, 429);
    }

    const day = new Date(now).toISOString().slice(0, 10);
    await db
      .prepare('INSERT INTO scores (k, n, s, w, d, t) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (k) DO NOTHING')
      .bind(b.k, n, b.s, b.w, day, now)
      .run();

    row = await db.prepare('SELECT id, s FROM scores WHERE k = ?1').bind(b.k).first();
    if (!row) return reply({ error: 'could not store run' }, 500);

    await db
      .prepare('DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY s DESC, id ASC LIMIT ?1)')
      .bind(KEEP)
      .run();
  }

  // Equal scores rank in the order they arrived (lower id ranks ahead)
  const ahead = await db
    .prepare('SELECT COUNT(*) AS c FROM scores WHERE s > ?1 OR (s = ?1 AND id < ?2)')
    .bind(row.s, row.id)
    .first();

  return reply({
    top: await getTop(db, row.id),
    rank: (ahead ? ahead.c : 0) + 1
  });
}

export default {
  async fetch(req, env) {
    try {
      return await handle(req, env.DB);
    } catch (err) {
      console.error(err);
      return reply({ error: 'server error' }, 500);
    }
  }
};
