import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client that uses the service role key.
 *
 * The service role key bypasses Row Level Security entirely, so this client
 * must never be imported in browser code or passed to the client side.
 *
 * Use this for server-side operations that need to read or write shared
 * tables (e.g. category_rules) regardless of the current user session.
 *
 * Usage:
 *   import { supabaseServer } from '@/lib/supabase/server'
 *   // only in Server Components, Server Actions, Route Handlers, or services
 */
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      // Disable automatic session persistence — this client is stateless
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)
