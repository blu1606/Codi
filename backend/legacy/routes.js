// Transitional: the prototype's JSON store (tables docs/kv in database codi_rebuild), mounted on the Hono app
// so pages that still read Codi.db() keep working while they move to the real API. Removed once every page
// calls the backend. Endpoints: GET /api/snapshot, POST /api/sync, POST /api/reset.
import { pool, ensureSchema } from './db.js';
import { reseed } from './seed.js';

const errorMessage = (e) => (e instanceof Error ? e.message : String(e));

/** Creates the tables and seeds an empty legacy database. Throws when Postgres is unreachable. */
export async function prepareLegacyStore() {
  await ensureSchema();
  const { rows } = await pool.query('select 1 from kv where key = $1', ['meta:docCollections']);
  if (!rows.length) { await reseed(); console.log('Legacy store empty: seeded from the mockup data.'); }
}

export function mountLegacyStore(app) {
  // Whole prototype state: { db, slices, docCollections }. db mirrors the mockup's Codi.db() shape.
  app.get('/api/snapshot', async (c) => {
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
      return c.json({ db, slices, docCollections });
    } catch (e) {
      return c.json({ error: errorMessage(e) }, 500);
    }
  });

  // Batched write from the client store.
  // body: { upserts:[{collection,id,data}], deletes:[{collection,id}], kv:{key:value}, kvDelete:[key] }
  app.post('/api/sync', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const { upserts = [], deletes = [], kv = {}, kvDelete = [] } = body;
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const u of upserts) {
        await client.query(
          'insert into docs (collection, id, data) values ($1, $2, $3) on conflict (collection, id) do update set data = excluded.data',
          [u.collection, u.id, u.data],
        );
      }
      for (const d of deletes) await client.query('delete from docs where collection = $1 and id = $2', [d.collection, d.id]);
      for (const [key, value] of Object.entries(kv)) {
        await client.query(
          'insert into kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
          [key, JSON.stringify(value)],
        );
      }
      for (const key of kvDelete) await client.query('delete from kv where key = $1', [key]);
      await client.query('commit');
      return c.json({ ok: true });
    } catch (e) {
      await client.query('rollback').catch(() => {});
      return c.json({ error: errorMessage(e) }, 500);
    } finally {
      client.release();
    }
  });

  app.post('/api/reset', async (c) => {
    try { return c.json({ ok: true, ...(await reseed()) }); }
    catch (e) { return c.json({ error: errorMessage(e) }, 500); }
  });
}

export const closeLegacyStore = () => pool.end();
