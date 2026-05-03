import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

// user_history schema:
//   id       BIGSERIAL PK
//   period   TEXT
//   numbers  INTEGER[]
//   saved_at TIMESTAMPTZ DEFAULT now()

export async function GET() {
  try {
    const db = getServerClient()

    const { data, error } = await db
      .from('user_history')
      .select('period, numbers, saved_at')
      .order('saved_at', { ascending: true })

    if (error) {
      console.error('[history] GET error:', error.message)
      return NextResponse.json({ records: [] })
    }

    const records = (data ?? []).map(row => ({
      period:  row.period  as string,
      numbers: row.numbers as number[],
      date:    row.saved_at as string,   // 保持與原介面相容
    }))

    return NextResponse.json({ records })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[history] GET exception:', msg)
    return NextResponse.json({ records: [], error: msg })
  }
}

export async function POST(req: Request) {
  const body = await req.json() as { period?: string; numbers?: number[] }
  const { period, numbers } = body

  if (!period || !Array.isArray(numbers) || numbers.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  try {
    const db = getServerClient()

    const { error } = await db
      .from('user_history')
      .insert({ period, numbers })

    if (error) {
      console.error('[history] POST error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[history] POST exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
