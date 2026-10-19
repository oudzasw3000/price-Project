import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
export async function verifyPassword(password,stored){const [salt,hash]=stored.split(':');const actual=await scrypt(password,salt,64);const expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
export class AuthStore{
  constructor(pool){this.pool=pool;}
  async load(env=process.env){
    await this.pool.query('CREATE TABLE IF NOT EXISTS gamestation_admin (id SMALLINT PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, password_hash TEXT NOT NULL)');
    let result=await this.pool.query('SELECT username, password_hash FROM gamestation_admin WHERE id = 1');
    if(!result.rows.length){
      const username=env.APP_USERNAME?.trim(),password=env.APP_PASSWORD;
      if(!username||username.includes(':')||!password||password.length<5)throw new Error('First setup requires APP_USERNAME and APP_PASSWORD (minimum 5 characters)');
      await this.pool.query('INSERT INTO gamestation_admin (id,username,password_hash) VALUES (1,$1,$2) ON CONFLICT (id) DO NOTHING',[username,await hashPassword(password)]);
      result=await this.pool.query('SELECT username, password_hash FROM gamestation_admin WHERE id = 1');
    }
    return result.rows[0];
  }
  async authorized(header){
    if(!header?.startsWith('Basic '))return false;
    const raw=Buffer.from(header.slice(6),'base64').toString('utf8'),colon=raw.indexOf(':');
    if(colon<0||raw.length>1024)return false;
    const {rows}=await this.pool.query('SELECT username,password_hash FROM gamestation_admin WHERE id = 1');
    return !!rows[0]&&raw.slice(0,colon)===rows[0].username&&await verifyPassword(raw.slice(colon+1),rows[0].password_hash);
  }
  async change(currentPassword,username,password){
    if(typeof username!=='string'||!username.trim()||username.length>100||username.includes(':')||typeof password!=='string'||password.length<5||password.length>256)throw new Error('กรอกชื่อผู้ใช้และรหัสใหม่อย่างน้อย 5 ตัวอักษร');
    const {rows}=await this.pool.query('SELECT username,password_hash FROM gamestation_admin WHERE id = 1');
    if(typeof currentPassword!=='string'||!rows[0]||!await verifyPassword(currentPassword,rows[0].password_hash))throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    const result=await this.pool.query('UPDATE gamestation_admin SET username=$1,password_hash=$2 WHERE id=1 AND password_hash=$3 RETURNING id',[username.trim(),await hashPassword(password),rows[0].password_hash]);
    if(!result.rows.length)throw new Error('บัญชีถูกแก้ไขแล้ว กรุณาเข้าสู่ระบบใหม่');
  }
}
