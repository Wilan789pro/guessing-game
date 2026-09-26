const config = await fetch(new URL('./config.json', import.meta.url))
  .then((response) => response.ok ? response.json() : {})
  .catch(() => ({}));

window.__APP_CONFIG__ = config;

export const appConfig = config;

export const supabase = config.supabaseUrl && config.supabaseAnonKey
  ? (await import('https://esm.sh/@supabase/supabase-js@2')).createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
