import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseLevel, validateLayout, type Level } from './level';
import { validateAccount, validateLogin, validateDisplayName } from './auth';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const localBackend = import.meta.env.VITE_BACKEND_MODE === 'local';
const localMatch = url?.match(/^http:\/\/(127\.0\.0\.1|localhost):([0-9]{1,5})\/?$/);
const localUrl = Boolean(localMatch && Number(localMatch[2]) > 0 && Number(localMatch[2]) <= 65535);
const hostedUrl = Boolean(url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !url.includes('YOUR_PROJECT'));
export const configured = Boolean(key && !key.includes('YOUR_PUBLIC') && (localBackend ? localUrl : hostedUrl && (!import.meta.env.DEV || import.meta.env.VITE_ALLOW_HOSTED_DEV === 'true')));
export interface OwnedLevel extends Level { revision:number; published:boolean; canPublish:boolean }
export interface CourseSummary extends Level { averageRating:number|null; ratingCount:number; favoriteCount:number; isFavorite:boolean }
export interface InteractionState { rating:number|null; favorite:boolean; eligible:boolean }
type Statistics = {level_id:string; average_rating:number|string|null; rating_count:number|string; favorite_count:number|string};
const parseOwnedLevel = (value:unknown):OwnedLevel => {
  const row=value as Record<string,unknown>;
  if(!row || !Number.isInteger(row.revision) || Number(row.revision)<1 || typeof row.published!=='boolean' || typeof row.can_publish!=='boolean')throw Error('Invalid saved-course record.');
  return {...parseLevel(row),revision:Number(row.revision),published:row.published,canPublish:row.can_publish};
};
export class Backend {
  readonly client: SupabaseClient;
  constructor() {
    if (!configured) throw new Error('Online accounts need the Supabase project configuration.');
    this.client = createClient(url!, key!, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,...(localBackend?{storageKey:`skystride.local.auth.${new URL(url!).port}`}:{})}});
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
    const {data,error}=await this.client.from('levels').select('id,title,description,difficulty,layout,official_order').eq('published',true).order('title');
    if(error)throw error;return data.map(parseLevel);
  }
  async startAttempt(userId:string,levelId:string):Promise<string> {
    const {data,error}=await this.client.from('play_attempts').insert({user_id:userId,level_id:levelId}).select('id').single();
    if(error)throw error;return data.id;
  }
  async completeAttempt(id:string,elapsedMs:number,deaths:number) {
    const {error}=await this.client.rpc('complete_attempt',{p_attempt_id:id,p_elapsed_ms:elapsedMs,p_deaths:deaths});
    if(error)throw error;
  }
  async progress(_userId:string):Promise<{levelId:string;completed:boolean;bestMs:number|null}[]> {
    const {data,error}=await this.client.rpc('own_progress');
    if(error)throw error;
    return (data as {level_id:string;best_ms:number}[]).map(row=>({levelId:row.level_id,completed:true,bestMs:row.best_ms}));
  }
  async ownedLevels(_userId:string):Promise<OwnedLevel[]> {
    const {data,error}=await this.client.rpc('owned_levels');
    if(error)throw error;return (data as unknown[]).map(parseOwnedLevel);
  }
  async getOwnedLevel(userId:string,id:string):Promise<OwnedLevel> {
    const row=(await this.ownedLevels(userId)).find(level=>level.id===id);
    if(!row)throw Error('Saved course not found.');return row;
  }
  async drafts(userId:string):Promise<OwnedLevel[]> { return (await this.ownedLevels(userId)).filter(level=>!level.published); }
  async saveDraft(_userId:string,draft:Omit<Level,'id'>,id:string=crypto.randomUUID(),expectedRevision?:number):Promise<OwnedLevel> {
    validateLayout(draft.layout);
    const values={title:draft.title.trim(),description:draft.description.trim(),difficulty:draft.difficulty,layout:draft.layout};
    if(!values.title || values.title.length>60 || values.description.length>280)throw Error('Use a title of 1–60 characters and a description of at most 280 characters.');
    const {data,error}=await this.client.rpc('save_draft',{p_id:id,p_expected_revision:expectedRevision??null,p_title:values.title,p_description:values.description,p_difficulty:values.difficulty,p_layout:values.layout});
    if(error)throw error;return parseOwnedLevel(data);
  }
  async startDraftPlaytest(levelId:string,revision:number):Promise<{id:string;level:OwnedLevel}> {
    const {data,error}=await this.client.rpc('start_draft_playtest',{p_level_id:levelId,p_expected_revision:revision});
    if(error)throw error;
    if(!data || typeof data.id!=='string')throw Error('Could not start the saved playtest.');
    return {id:data.id,level:parseOwnedLevel(data.level)};
  }
  async completeDraftPlaytest(testId:string,elapsedMs:number,deaths:number):Promise<void> {
    const {error}=await this.client.rpc('complete_draft_playtest',{p_test_id:testId,p_elapsed_ms:elapsedMs,p_deaths:deaths});
    if(error)throw error;
  }
  async publishLevel(levelId:string,revision:number):Promise<OwnedLevel> {
    const {data,error}=await this.client.rpc('publish_level',{p_level_id:levelId,p_expected_revision:revision});
    if(error)throw error;return parseOwnedLevel(data);
  }
  async catalog(userId?:string):Promise<CourseSummary[]> {
    const [levels,statistics,favorites]=await Promise.all([
      this.levels(),this.client.rpc('level_statistics'),
      userId?this.client.from('favorites').select('level_id').eq('user_id',userId):Promise.resolve({data:[],error:null})
    ]);
    if(statistics.error)throw statistics.error;if(favorites.error)throw favorites.error;
    const stats=new Map((statistics.data as Statistics[]).map(s=>[s.level_id,s]));
    const mine=new Set((favorites.data??[]).map(f=>f.level_id));
    return levels.map(level=>{
      const s=stats.get(level.id);
      return {...level,averageRating:s?.average_rating==null?null:Number(s.average_rating),ratingCount:Number(s?.rating_count??0),favoriteCount:Number(s?.favorite_count??0),isFavorite:mine.has(level.id)};
    });
  }
  async interactions(userId:string,levelId:string):Promise<InteractionState> {
    const [rating,favorite,attempt]=await Promise.all([
      this.client.from('ratings').select('score').eq('user_id',userId).eq('level_id',levelId).maybeSingle(),
      this.client.from('favorites').select('level_id').eq('user_id',userId).eq('level_id',levelId).maybeSingle(),
      this.client.from('play_attempts').select('id').eq('user_id',userId).eq('level_id',levelId).limit(1)
    ]);
    if(rating.error)throw rating.error;if(favorite.error)throw favorite.error;if(attempt.error)throw attempt.error;
    return {rating:rating.data?.score??null,favorite:!!favorite.data,eligible:!!attempt.data?.length};
  }
  async setRating(userId:string,levelId:string,score:number|null):Promise<void> {
    if(score!==null && (!Number.isInteger(score)||score<1||score>5))throw Error('Choose an integer rating from 1 to 5.');
    const query=score===null?this.client.from('ratings').delete().eq('user_id',userId).eq('level_id',levelId):
      this.client.from('ratings').upsert({user_id:userId,level_id:levelId,score},{onConflict:'user_id,level_id'});
    const {error}=await query;if(error)throw error;
  }
  async setFavorite(userId:string,levelId:string,value:boolean):Promise<void> {
    const query=value?this.client.from('favorites').upsert({user_id:userId,level_id:levelId},{onConflict:'user_id,level_id',ignoreDuplicates:true}):
      this.client.from('favorites').delete().eq('user_id',userId).eq('level_id',levelId);
    const {error}=await query;if(error)throw error;
  }
  async awards(userId:string) {
    const [catalog,earned]=await Promise.all([this.client.from('achievements').select('code,name,rule,threshold_ms').order('code'),this.client.from('player_achievements').select('achievement_code,earned_at').eq('player_id',userId)]);
    if(catalog.error)throw catalog.error;if(earned.error)throw earned.error;
    return catalog.data.map(a=>({...a,earned_at:earned.data.find(e=>e.achievement_code===a.code)?.earned_at as string|undefined}));
  }
  async leaderboard(levelId:string):Promise<{rank:number;display_name:string;elapsed_ms:number}[]> {
    const {data,error}=await this.client.rpc('level_leaderboard',{p_level_id:levelId});if(error)throw error;return data;
  }
}
export const backend = configured ? new Backend() : null;
