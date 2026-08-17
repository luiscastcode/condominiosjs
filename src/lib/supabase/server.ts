// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import type { AstroGlobal } from 'astro';

export const createSupabaseServerClient = (Astro: AstroGlobal) => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // Obtener cookies de la solicitud
        const cookieHeader = Astro.request.headers.get('cookie') || '';
        const cookies: Record<string, string> = {};
        
        if (cookieHeader) {
          cookieHeader.split(';').forEach((cookie) => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
              cookies[name] = decodeURIComponent(value);
            }
          });
        }
        
        return Object.entries(cookies).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          Astro.response.headers.append(
            'Set-Cookie',
            `${name}=${encodeURIComponent(value)}; Path=${options?.path || '/'}; ${options?.maxAge ? `Max-Age=${options.maxAge};` : ''} ${options?.httpOnly ? 'HttpOnly;' : ''} ${options?.secure ? 'Secure;' : ''} ${options?.sameSite ? `SameSite=${options.sameSite};` : ''}`
          );
        });
      },
    },
  });
};