import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseLevel, type Level } from './level';
import { validateAccount, validateLogin, validateDisplayName } from './auth';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured = Boolean(url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_PUBLIC'));
export class Backend {
  readonly client: SupabaseClient;
  constructor() {
    if (!configured) throw new Error('Online accounts need the Supabase project configuration.');
    this.client = createClient(url!, key!, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  }
  async register(email: string, password: string, displayName: string) {
    validateAccount(email,password,displayName);
    const {data,error} = await this.client.auth.signUp({email:email.trim(),password,options:{data:{display_name:displayName.trim()},emailRedirectTo:location.origin+location.pathname}});
    if (error) throw error;
    return data;
  }
  async login(email: string, password: string) {
    validateLogin(email,password);
    const {error} = await this.client.auth.signInWithPassword({email:email.trim(),password}); if(error)throw error;
  }
  async logout() { const {error}=await this.client.auth.signOut(); if(error)throw error; }
  async profile(id: string) {
    const {data,error}=await this.client.from('profiles').select('id,display_name,created_at').eq('id',id).single();
    if(error)throw error; return data as {id:string;display_name:string;created_at:string};
  }
  async updateProfile(id:string,name:string) {
    const {data,error}=await this.client.from('profiles').update({display_name:validateDisplayName(name)}).eq('id',id).select('display_name').single();
    if(error)throw error;return data.display_name as string;
  }
  async levels(): Promise<Level[]> {
    const {data,error}=await this.client.from('levels').select('id,title,description,difficulty,layout').eq('published',true).order('title');
    if(error)throw error;return data.map(parseLevel);
  }
}
export const backend = configured ? new Backend() : null;
