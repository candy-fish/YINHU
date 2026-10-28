import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function testDatabase() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);");
  await db.exec(await readFile(new URL('../../supabase/migrations/20261028000100_shared_workspace.sql', import.meta.url), 'utf8'));
  const files = new Map();
  const repository = {
    async list(resource, includeDeleted = false) {
      return (await db.query('select * from blackdoor_records where resource=$1' + (includeDeleted ? '' : ' and deleted_at is null') + ' order by created_at', [resource])).rows;
    },
    async get(resource, id) { return (await db.query('select * from blackdoor_records where resource=$1 and id=$2', [resource, id])).rows[0] || null; },
    async insert(resource, data) {
      try { return (await db.query('insert into blackdoor_records(resource,data) values ($1,$2) returning *', [resource, JSON.stringify(data)])).rows[0]; }
      catch (error) { if (error.code === '23505') error.status = 409; throw error; }
    },
    async update(resource, id, version, data, deletedAt) {
      return (await db.query('update blackdoor_records set data=$1,version=version+1,updated_at=now(),deleted_at=$2 where resource=$3 and id=$4 and version=$5 returning *',
        [JSON.stringify(data), deletedAt, resource, id, version])).rows[0] || null;
    },
    async counter(id) { return (await db.query('select blackdoor_increment($1) as value', [id || null])).rows[0].value; },
    async upload(id, bytes) { files.set(id, bytes.slice()); },
    async download(id) { return files.has(id) ? new Response(files.get(id)) : new Response(null, { status: 404 }); }
  };
  return { db, repository };
}
