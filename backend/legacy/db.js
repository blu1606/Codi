import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.LEGACY_DATABASE_URL || 'postgresql://codi:codi@localhost:5544/codi_rebuild',
});

// Two tables keep the prototype's data model intact:
//  docs — one row per entity of an id-keyed collection (users, courses, orders…), in seed order.
//  kv   — everything else: non-collection db keys (levels, bankInfo, knowledgeMaps…) and per-feature state slices.
export async function ensureSchema(client = pool) {
  await client.query(`
    create table if not exists docs (
      collection text not null,
      id text not null,
      ord bigserial,
      data jsonb not null,
      primary key (collection, id)
    );
    create table if not exists kv (
      key text primary key,
      value jsonb not null
    );
  `);
}
