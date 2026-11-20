const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};
const reply = (data, status = 200) => Response.json(data, {status, headers});

function scoreRange(w) {
  // engine.js awards 10 per distinct rail. The layouts cycle through 76, 78,
  // 77 rails (231 per cycle). Each completed level j also awards 100*j.
  const completed = w - 1;
  const rails = 231 * Math.floor(completed / 3) + [0, 76, 154][completed % 3];
  const min = 10 * rails + 50 * completed * w;
  // Finishing the last rail clears the board, so a death on w can include
  // at most all but one of its rails. Revisits and lost lives earn nothing.
  return [min, min + 10 * ([76, 78, 77][completed % 3] - 1)];
}

const top = "SELECT n,s,w,date(t/1000,'unixepoch') AS d";
const order = " FROM runs ORDER BY s DESC,rowid ASC LIMIT 10";

async function handle(req, db) {
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (new URL(req.url).pathname !== "/") return reply({error:"Unknown path"}, 404);
  if (req.method === "GET") return reply({top:(await db.prepare(top + order).all()).results});
  if (req.method !== "POST") return reply({error:"Method not allowed"}, 405);
  const text = await req.text();
  if (text.length > 512) return reply({error:"Run too large"}, 413);
  let run;
  try {run = JSON.parse(text);} catch {return reply({error:"Invalid JSON"}, 400);}
  if (!run || typeof run.k !== "string" || !/^[0-9a-f]{32}$/.test(run.k) ||
      typeof run.n !== "string" || !Number.isSafeInteger(run.s) || run.s <= 0 ||
      run.s % 10 !== 0 || !Number.isSafeInteger(run.w) || run.w < 1) return reply({error:"Invalid run"}, 422);
  const [min,max] = scoreRange(run.w);
  if (run.s < min || run.s > max) return reply({error:"Impossible score"}, 422);
  const n = (run.n.toUpperCase().match(/[\p{L}\p{N}]/gu) || []).slice(0,3).join("");
  const now = Date.now();
  // One D1 transaction protects admission, tie ordering, rank and pruning.
  const statements = [
    db.prepare("DELETE FROM admissions WHERE t <= ?").bind(now - 60000),
    db.prepare("UPDATE runs SET n=? WHERE k=?").bind(n,run.k),
    db.prepare("INSERT INTO runs(k,n,s,w,t) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM runs WHERE k=?) AND (SELECT count(*) FROM admissions)<30").bind(run.k,n,run.s,run.w,now,run.k),
    db.prepare("SELECT 1+(SELECT count(*) FROM runs a WHERE a.s>b.s OR (a.s=b.s AND a.rowid<b.rowid)) AS rank FROM runs b WHERE k=?").bind(run.k),
    db.prepare(top + ", k=? AS me" + order).bind(run.k),
    db.prepare("DELETE FROM runs WHERE rowid IN (SELECT rowid FROM runs ORDER BY s DESC,rowid LIMIT -1 OFFSET 200)")
  ];
  const result = await db.batch(statements);
  const rank = result[3].results[0]?.rank;
  if (!rank) return reply({error:"Too many new entries"}, 429);
  return reply({top:result[4].results.map(row=>({...row,me:Boolean(row.me)})),rank});
}

export default {
  async fetch(req, env) {
    try {return await handle(req, env.DB);}
    catch {return reply({error:"Score service unavailable"}, 503);}
  }
};
