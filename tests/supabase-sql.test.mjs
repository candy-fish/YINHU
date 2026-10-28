import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/shared-test-db.mjs';
test('PostgreSQL migration creates an empty private workspace and idempotent exact counter', async () => {
  const { db, repository } = await testDatabase();
  try {
    assert.equal((await db.query('select count(*)::int as count from blackdoor_records')).rows[0].count, 0);
    const access = (await db.query("select has_table_privilege('anon','public.blackdoor_records','SELECT') as read, has_table_privilege('authenticated','public.blackdoor_records','INSERT') as write, has_function_privilege('anon','public.blackdoor_increment(uuid)','EXECUTE') as counter")).rows[0];
    assert.deepEqual(access, { read: false, write: false, counter: false });
    assert.equal((await repository.counter()).value, '0');
    const ids = Array.from({ length: 20 }, () => crypto.randomUUID());
    await Promise.all([...ids, ...ids].map(id => repository.counter(id)));
    assert.equal((await repository.counter()).value, '20');
    await db.query("update blackdoor_counter set value = '9007199254740999'");
    assert.equal((await repository.counter(crypto.randomUUID())).value, '9007199254741000');
  } finally { await db.close(); }
});
