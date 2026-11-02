import { pool, ensureSchema } from './db.js';
import { loadSeed, isDocCollection } from '../scripts/seed-source/load-seed.js';

// Drops and rebuilds both tables from the mockup seed, in one transaction.
export async function reseed() {
  const db = loadSeed();
  const docCollections = Object.keys(db).filter((k) => isDocCollection(db[k]));
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('drop table if exists docs; drop table if exists kv;');
    await ensureSchema(c);
    for (const [key, value] of Object.entries(db)) {
      if (docCollections.includes(key)) {
        for (const item of value) {
          await c.query('insert into docs (collection, id, data) values ($1, $2, $3)', [key, item.id, item]);
        }
      } else {
        await c.query('insert into kv (key, value) values ($1, $2)', ['db:' + key, JSON.stringify(value)]);
      }
    }
    await c.query('insert into kv (key, value) values ($1, $2)', ['meta:docCollections', JSON.stringify(docCollections)]);
    await c.query('commit');
  } catch (err) {
    await c.query('rollback');
    throw err;
  } finally {
    c.release();
  }
  return { docCollections, kvKeys: Object.keys(db).filter((k) => !docCollections.includes(k)) };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  reseed()
    .then((r) => {
      console.log('Seeded. Doc collections:', r.docCollections.join(', '));
      console.log('KV keys:', r.kvKeys.join(', '));
    })
    .catch((e) => { console.error('Seed failed:', e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
