import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createLocalStore } from '../server/store.mjs';
import { createTestServer } from '../server/app.mjs';
import { loginAccounts } from '../src/data/loginAccounts.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=path.join(root,'local-private/local-event-20261007');
const dist=path.join(root,'dist');
await fs.mkdir(privateDir,{recursive:true});
const configPath=path.join(privateDir,'config.json');
let config;
try{config=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;config={adminKey:randomBytes(32).toString('hex'),gameId:null};}
const store=await createLocalStore(path.join(privateDir,'database'));
if(process.argv.includes('--sync-roster-only')){
 try{
  const prior=await store.read(config.gameId,true);if(!prior)throw new Error('Existing local game missing');
  const backupDir=path.join(root,'local-private/login-verification-20261007/before-16-player-adjustment');
  await fs.mkdir(backupDir,{recursive:true});
  try{await fs.writeFile(path.join(backupDir,'game-state.json'),JSON.stringify(prior),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  await store.update(config.gameId,state=>{
   const oldMap=new Map(state.accounts.map(account=>[account.username,account]));
   state.accounts=loginAccounts.map(account=>{
    const old=oldMap.get(account.username);
    if(!old||old.passwordHash!==account.passwordHash||old.salt!==account.salt)throw new Error('Account snapshot differs');
    return {...old,...account};
   });
   return null;
  },true);
  const next=await store.read(config.gameId,true);
  const withoutAccounts=state=>JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key])=>key!=='accounts')));
  if(withoutAccounts(prior)!==withoutAccounts(next))throw new Error('Unrelated game state changed');
  console.log(JSON.stringify({existingGameUpdated:true,players:next.accounts.filter(account=>account.role==='player').length,otherGameStatePreserved:true}));
 }finally{await store.close();}
 process.exit(0);
}
const app=await createTestServer({store,testKey:randomBytes(32).toString('hex'),gameAdminKey:config.adminKey,enabled:false,origins:['http://127.0.0.1:4170','http://localhost:4170']});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
app.setNotFoundHandler(async(request,reply)=>{
 const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1:4170').pathname);
 if(pathname.startsWith('/api/'))return reply.code(404).send({message:'接口不存在'});
 let target=path.resolve(dist,'.'+pathname);
 if(target!==dist&&!target.startsWith(dist+path.sep))return reply.code(403).send('Forbidden');
 try{if(!(await fs.stat(target)).isFile())target=path.join(dist,'index.html');}
 catch(error){if(path.extname(pathname))return reply.code(404).send('Not found');target=path.join(dist,'index.html');}
 reply.type(mime[path.extname(target)]??'application/octet-stream');reply.header('Cache-Control','no-store');
 return reply.send(await fs.readFile(target));
});
await app.listen({host:'127.0.0.1',port:4170});
if(!config.gameId||!await store.read(config.gameId,true)){
 const response=await fetch('http://127.0.0.1:4170/api/games',{method:'POST',headers:{Authorization:`Bearer ${config.adminKey}`,'Content-Type':'application/json'},body:'{}'});
 if(!response.ok)throw new Error('Local game initialization failed');config.gameId=(await response.json()).id;
 await fs.writeFile(configPath,JSON.stringify(config,null,2));
}
const url=`http://127.0.0.1:4170/?game=${config.gameId}`;
await fs.writeFile(path.join(privateDir,'ready.json'),JSON.stringify({url,gameId:config.gameId,status:'READY',startedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({url,localOnly:true,competitionStarted:false}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await store.close();process.exit(0);});
