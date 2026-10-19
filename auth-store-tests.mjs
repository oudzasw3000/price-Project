import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import {AuthStore} from './app/auth-store.mjs';
const basic=(u,p)=>'Basic '+Buffer.from(u+':'+p).toString('base64');
test('database login persists hashes, changes credentials, and does not reset on restart',async()=>{
  const {Pool}=newDb({noAstCoverageCheck:true}).adapters.createPg();const pool=new Pool();
  try{
    const auth=new AuthStore(pool);await auth.load({APP_USERNAME:'fixture',APP_PASSWORD:'test-initial'});
    const row=(await pool.query('SELECT * FROM gamestation_admin')).rows[0];assert.notEqual(row.password_hash,'test-initial');
    assert.equal(await auth.authorized(basic('fixture','test-initial')),true);
    assert.equal(await auth.authorized(basic('fixture','wrong')),false);
    await assert.rejects(auth.change('wrong','new-user','test-new'));
    await auth.change('test-initial','new-user','test-new');
    await new AuthStore(pool).load({APP_USERNAME:'fixture',APP_PASSWORD:'test-initial'});
    assert.equal(await auth.authorized(basic('fixture','test-initial')),false);
    assert.equal(await auth.authorized(basic('new-user','test-new')),true);
    assert.equal(await auth.authorized(undefined),false);
  }finally{await pool.end();}
});
test('database outage does not bypass login',async()=>{
  const auth=new AuthStore({query:async()=>{throw new Error('offline');}});
  await assert.rejects(auth.load({}));await assert.rejects(auth.authorized(basic('fixture','test-initial')));
});
