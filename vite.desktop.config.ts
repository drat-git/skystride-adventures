import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// Separate from vite.config.ts: Pages keeps its existing build, URL and AI endpoint.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.VITE_SUPABASE_URL ?? '') || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw Error('The Mac build needs the production Supabase URL and publishable key in .env.local.');
  }
  const aiModule = resolve('src/ai.ts');
  return {
    base: '/',
    build: { outDir: 'dist-desktop', emptyOutDir: true },
    define: { 'import.meta.env.VITE_BACKEND_MODE': '"hosted"' },
    plugins: [{
      name: 'desktop-ai-endpoint',
      enforce: 'pre',
      transform(code, id) {
        if (id.split('?')[0] !== aiModule) return;
        const invocation = /\.functions\.invoke\(\s*(['"])ai-assist\1\s*,/;
        if (!invocation.test(code)) throw Error('Desktop AI endpoint binding needs updating.');
        return { code: code.replace(invocation, '.functions.invoke("ai-assist-desktop",'), map: null };
      },
    }],
  };
});
