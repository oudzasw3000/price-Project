import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
export async function atomicWrite(file,text){await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',text,'utf8');await rename(file+'.tmp',file);}
function dpapi(input,unprotect=false){
  if(process.platform!=='win32')throw new Error('Encrypted account storage requires Windows');
  const action=unprotect?'Unprotect':'Protect';
  const script=`Add-Type -AssemblyName System.Security; $inputData=[Console]::In.ReadToEnd(); $bytes=[Convert]::FromBase64String($inputData); $result=[System.Security.Cryptography.ProtectedData]::${action}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.resume();child.on('error',reject);
    child.on('close',code=>code===0?resolve(Buffer.from(output.trim(),'base64')):reject(new Error('Windows ไม่สามารถอ่านหรือเข้ารหัสบัญชีนี้ได้')));
    child.stdin.end(input.toString('base64'));
  });
}
export async function saveVault(file,value){
 if(process.env.VAULT_KEY){
  const key=Buffer.from(process.env.VAULT_KEY,'hex');if(key.length!==32)throw new Error('Invalid VAULT_KEY');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  await atomicWrite(file,JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));return;
 }
 const blob=await dpapi(Buffer.from(JSON.stringify(value)));await atomicWrite(file,blob.toString('base64'));
}
export async function loadVault(file){let raw;try{raw=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return {};throw e;}if(process.env.VAULT_KEY){const obj=JSON.parse(raw);if(obj.v!==1)throw new Error('Unsupported vault');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.VAULT_KEY,'hex'),Buffer.from(obj.iv,'base64'));decipher.setAuthTag(Buffer.from(obj.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(obj.data,'base64')),decipher.final()]).toString('utf8'));}return JSON.parse((await dpapi(Buffer.from(raw,'base64'),true)).toString());}
