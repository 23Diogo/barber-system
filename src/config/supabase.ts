import { createClient } from '@supabase/supabase-js'

const url     = process.env.SUPABASE_URL!
const anon    = process.env.SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_KEY!

export const supabase      = createClient(url, anon)
export const supabaseAdmin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false }
})
