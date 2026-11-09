import { afterEach, expect, it, vi } from 'vitest';
const createClient=vi.hoisted(()=>vi.fn(()=>({auth:{}})));
vi.mock('@supabase/supabase-js',()=>({createClient}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();createClient.mockClear();});
async function config(mode:string,url:string,dev=true,allow=''){
 vi.stubEnv('VITE_BACKEND_MODE',mode);vi.stubEnv('VITE_SUPABASE_URL',url);vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-test-key');
 vi.stubEnv('DEV',dev);vi.stubEnv('VITE_ALLOW_HOSTED_DEV',allow);return import('../src/backend');
}
it('blocks inherited hosted credentials during development unless explicitly opted in',async()=>{
 const api=await config('','https://class-project.supabase.co');expect(api.configured).toBe(false);expect(api.backend).toBeNull();expect(createClient).not.toHaveBeenCalled();
});
it('uses loopback-only local mode with an isolated auth storage key',async()=>{
 const api=await config('local','http://127.0.0.1:54329');expect(api.localBackend).toBe(true);expect(api.configured).toBe(true);
 expect(createClient).toHaveBeenCalledWith('http://127.0.0.1:54329','public-test-key',expect.objectContaining({auth:expect.objectContaining({storageKey:'skystride.local.auth.54329'})}));
});
it.each(['https://class-project.supabase.co','http://192.168.1.1:54329','http://127.0.0.1:99999','http://127.0.0.1:0','http://localhost:54329/remote','http://user:pass@localhost:54329'])('rejects non-loopback or malformed local endpoints: %s',async url=>{
 const api=await config('local',url);expect(api.configured).toBe(false);expect(createClient).not.toHaveBeenCalled();
});
it('retains hosted configuration for a production build',async()=>{
 const api=await config('','https://class-project.supabase.co',false);expect(api.configured).toBe(true);expect(api.localBackend).toBe(false);
 expect(createClient).toHaveBeenCalledWith(expect.any(String),expect.any(String),expect.objectContaining({auth:expect.not.objectContaining({storageKey:expect.anything()})}));
});
it('allows deliberate future hosted development opt-in',async()=>{
 expect((await config('','https://class-project.supabase.co',true,'true')).configured).toBe(true);
});
