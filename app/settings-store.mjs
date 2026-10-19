import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {validateSettings} from './model.mjs';
import {atomicWrite} from './vault.mjs';

const defaults={fx:0,purchaseFee:0.251,markup:2,fee:0,interval:0};
export class SettingsStore{
  constructor({file,pool}){this.file=file;this.pool=pool;}
  async legacy(){
    try{return validateSettings(JSON.parse(await readFile(this.file,'utf8')));}
    catch(e){if(e.code==='ENOENT')return validateSettings(defaults);throw new Error('Existing settings file is invalid; fix it before migration');}
  }
  async load(){
    if(!this.pool)return this.legacy();
    await this.pool.query(`CREATE TABLE IF NOT EXISTS gamestation_settings (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      settings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    let result=await this.pool.query('SELECT settings FROM gamestation_settings WHERE id = 1');
    if(!result.rows.length){
      const seed=await this.legacy();
      await this.pool.query('INSERT INTO gamestation_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(seed)]);
      result=await this.pool.query('SELECT settings FROM gamestation_settings WHERE id = 1');
    }
    return validateSettings(result.rows[0].settings);
  }
  async save(input){
    const next=validateSettings(input);
    if(this.pool){
      await this.pool.query('INSERT INTO gamestation_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()',[JSON.stringify(next)]);
    }else await atomicWrite(this.file,JSON.stringify(next));
    return next;
  }
  async close(){await this.pool?.end();}
}
export function createSettingsStore(file,env=process.env){
  if(!env.DATABASE_URL&&(env.NODE_ENV==='production'||env.RAILWAY_ENVIRONMENT_ID))throw new Error('Set DATABASE_URL to your Railway PostgreSQL connection');
  const pool=env.DATABASE_URL?new pg.Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:10000,query_timeout:10000}):null;
  pool?.on('error',()=>console.error('Settings database connection error'));
  return new SettingsStore({file,pool});
}
