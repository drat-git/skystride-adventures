import type { SupabaseClient } from '@supabase/supabase-js';
import type { Level } from './level';
import { parseAiReply, type AiRequest, type AiReply, type GameplayState } from './ai-contract';
export type { GameplayState } from './ai-contract';

// Only course data and gameplay observations leave the browser; no account/profile fields.
export function buildGameplayContext(level: Level, state: GameplayState): AiRequest & { mode:'hint' } {
  return structuredClone({mode:'hint',course:{title:level.title,difficulty:level.difficulty,layout:level.layout},state});
}
export function buildEditorContext(draft: Omit<Level,'id'>): AiRequest & { mode:'editor' } {
  return structuredClone({mode:'editor',course:{title:draft.title,difficulty:draft.difficulty,layout:draft.layout}});
}
export async function requestAssistance(client: SupabaseClient, context: AiRequest, signal: AbortSignal): Promise<AiReply> {
  const {data,error}=await client.functions.invoke('ai-assist',{body:context,signal,timeout:30000});
  if(signal.aborted)throw new DOMException('Request cancelled.','AbortError');
  if(error){
    let message='AI assistance could not connect. Please try again.';
    if(error.context instanceof Response){
      try{const body=await error.context.json();if(typeof body.message==='string'&&body.message.length<=240)message=body.message;}catch{}
    }else if(error.name==='FunctionsFetchError')message='AI assistance could not connect or timed out. Please try again.';
    throw Error(message);
  }
  return parseAiReply(data,context.mode);
}
