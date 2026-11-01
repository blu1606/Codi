import express from 'express';
import cors from 'cors';
import { pool, ensureSchema } from './db.js';
import { reseed } from './seed.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

// Whole prototype state: { db, slices, docCollections }. db mirrors the mockup's Codi.db() shape.
app.get('/api/snapshot', async (_req, res) => {
  try {
    const kv = await pool.query('select key, value from kv');
    const docs = await pool.query('select collection, data from docs order by ord');
    const db = {};
    const slices = {};
    let docCollections = [];
    for (const row of kv.rows) {
      if (row.key === 'meta:docCollections') docCollections = row.value;
      else if (row.key.startsWith('db:')) db[row.key.slice(3)] = row.value;
      else if (row.key.startsWith('slice:')) slices[row.key.slice(6)] = row.value;
    }
    docCollections.forEach((name) => { db[name] = []; });
    for (const row of docs.rows) (db[row.collection] = db[row.collection] || []).push(row.data);
    res.json({ db, slices, docCollections });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batched write from the client store.
// body: { upserts:[{collection,id,data}], deletes:[{collection,id}], kv:{key:value}, kvDelete:[key] }
app.post('/api/sync', async (req, res) => {
  const { upserts = [], deletes = [], kv = {}, kvDelete = [] } = req.body || {};
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const u of upserts) {
      await c.query(
        'insert into docs (collection, id, data) values ($1, $2, $3) on conflict (collection, id) do update set data = excluded.data',
        [u.collection, u.id, u.data],
      );
    }
    for (const d of deletes) await c.query('delete from docs where collection = $1 and id = $2', [d.collection, d.id]);
    for (const [key, value] of Object.entries(kv)) {
      await c.query(
        'insert into kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
    for (const key of kvDelete) await c.query('delete from kv where key = $1', [key]);
    await c.query('commit');
    res.json({ ok: true });
  } catch (e) {
    await c.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    c.release();
  }
});

app.post('/api/reset', async (_req, res) => {
  try { res.json({ ok: true, ...(await reseed()) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const port = Number(process.env.API_PORT || 4100);
ensureSchema()
  .then(async () => {
    const { rows } = await pool.query('select 1 from kv where key = $1', ['meta:docCollections']);
    if (!rows.length) { await reseed(); console.log('Empty database: seeded from mockup data.'); }
    app.listen(port, () => console.log(`Codi API on http://localhost:${port}`));
  })
  .catch((e) => {
    console.error('Cannot reach Postgres. Run "npm run db:up" first.', e.message);
    process.exit(1);
  });
