import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ────────────────────────────────────────────────────────────
// 伺服器端 Supabase Client（僅在 API Route / Server Component 中使用）
//
// 優先使用 SUPABASE_SERVICE_ROLE_KEY（不受 RLS 限制，可直接讀寫）
// 若未設定 service role key，則退回 ANON_KEY（需在 Supabase 後台設定 RLS 允許）
// ────────────────────────────────────────────────────────────
export function getServerClient(): SupabaseClient {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key        = serviceKey ?? anonKey

  if (!url || !key) {
    throw new Error(
      'Supabase 尚未設定。請在 .env.local 中設定：\n' +
      '  NEXT_PUBLIC_SUPABASE_URL\n' +
      '  NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      '（選用）SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ────────────────────────────────────────────────────────────
// 瀏覽器端 Supabase Client（供前端 Client Component 使用，若有需要）
// ────────────────────────────────────────────────────────────
const _url     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? ''
const _anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase: SupabaseClient =
  _url && _anonKey ? createClient(_url, _anonKey) : ({} as SupabaseClient)
