// Separate desktop endpoint: the website and its existing ai-assist stay untouched.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createAiHandler, generateOpenAi } from '../../../src/ai-service.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const key = Deno.env.get('OPENAI_API_KEY') ?? '';
const dailyLimit = Math.min(10000, Math.max(1, Number(Deno.env.get('AI_PROJECT_DAILY_LIMIT')) || 200));
Deno.serve(createAiHandler({
  configured: !!key,
  allowedOrigins: ['app://skystride'],
  authenticate: async token => { const { data, error } = await service.auth.getUser(token); return error ? null : data.user?.id ?? null; },
  takeQuota: async userId => {
    const { data, error } = await service.rpc('take_ai_quota', { p_user_id: userId, p_project_daily_limit: Math.floor(dailyLimit) });
    if (error) throw error;
    return { allowed: data.allowed === true, retryAfter: Number(data.retry_after) };
  },
  generate: (context, signal) => generateOpenAi(context, signal, key, Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini'),
}));
