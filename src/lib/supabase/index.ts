import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server-side client using the anon key.
// Add SUPABASE_SERVICE_ROLE_KEY to .env.local and swap it in here
// if you need to bypass Row Level Security for server operations.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
