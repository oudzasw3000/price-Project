import {createHash,timingSafeEqual} from 'node:crypto';

export function hostingConfig(env=process.env){
  const cloud=env.NODE_ENV==='production'||!!env.RAILWAY_ENVIRONMENT_ID;
  const port=Number(env.PORT||4317);
  const origin=new URL(env.PUBLIC_URL||(env.RAILWAY_PUBLIC_DOMAIN?'https://'+env.RAILWAY_PUBLIC_DOMAIN:'http://127.0.0.1:'+port)).origin;
  if(cloud){
    if(!origin.startsWith('https://'))throw new Error('Set PUBLIC_URL to your HTTPS Railway domain');
    if(!env.DATABASE_URL&&(!env.APP_USERNAME||!env.APP_PASSWORD||env.APP_PASSWORD.length<16))throw new Error('Set APP_USERNAME and APP_PASSWORD (at least 16 characters)');
    if(!/^[a-f0-9]{64}$/i.test(env.VAULT_KEY||''))throw new Error('Set VAULT_KEY to 64 hexadecimal characters');
    if(!env.DATA_DIR&&!env.RAILWAY_VOLUME_MOUNT_PATH)throw new Error('Attach a Railway volume or set DATA_DIR');
  }
  return {cloud,port,origin,host:cloud?'0.0.0.0':'127.0.0.1',hosts:cloud?[new URL(origin).host]:['127.0.0.1:'+port,'localhost:'+port],origins:cloud?[origin]:[origin,'http://localhost:'+port]};
}
export function authorized(header,env=process.env){
  if(!env.APP_USERNAME&&!env.APP_PASSWORD)return env.NODE_ENV!=='production'&&!env.RAILWAY_ENVIRONMENT_ID;
  if(!header?.startsWith('Basic '))return false;
  const actual=Buffer.from(header.slice(6),'base64').toString('utf8');
  const hash=s=>createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(actual),hash(env.APP_USERNAME+':'+env.APP_PASSWORD));
}
