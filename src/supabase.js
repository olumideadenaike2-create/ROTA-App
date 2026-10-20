import { createClient } from '@supabase/supabase-js'

// Supabase's publishable key (sb_publishable_...) replaces the legacy anon key; either works here.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
)
