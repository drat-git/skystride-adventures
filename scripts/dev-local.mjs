// Local-only developer entry point. Existing .env.local is never rewritten.
import { createServer } from 'vite';
import { createLocalBackend, LOCAL_PUBLIC_KEY } from './local-backend.mjs';
import { fileURLToPath } from 'node:url';
const backend=await createLocalBackend({dataDir:fileURLToPath(new URL('../output/overhaul/local-db',import.meta.url)),port:Number(process.env.LOCAL_BACKEND_PORT??5187)});
process.env.VITE_BACKEND_MODE='local';process.env.VITE_SUPABASE_URL=backend.url;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY=LOCAL_PUBLIC_KEY;process.env.VITE_ALLOW_HOSTED_DEV='false';
let vite,closing=false;
const close=async()=>{if(closing)return;closing=true;await vite?.close();await backend.close();};
try{
 vite=await createServer({server:{host:'127.0.0.1',port:Number(process.env.LOCAL_GAME_PORT??5186),strictPort:true}});await vite.listen();
 console.log('SkyStride LOCAL development — real SQL/RLS with fixture Auth/REST; no confirmation emails.');
 console.log('Local database: output/overhaul/local-db. Production Supabase is not contacted.');
 console.log('Local API: '+backend.url);vite.printUrls();
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void close().then(()=>process.exit(0));});
}catch(error){await close();throw error;}
