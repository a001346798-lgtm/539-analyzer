import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

// user_history schema:
//   id       BIGSERIAL PK
//   period   TEXT
//   numbers  INTEGER[]
//   game     TEXT NOT NULL DEFAULT 'tw539'
//   saved_at TIMESTAMPTZ DEFAULT now()

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const game = searchParams.get('game') ?? 'tw539'

  try {
    const db = getServerClient()

    const { data, error } = await db
      .from('user_history')
      .select('id, period, numbers, saved_at')   // id 必須回傳供刪除使用
      .eq('game', game)
      .order('saved_at', { ascending: true })

    if (error) {
      console.error('[history] GET error:', error.message)
      return NextResponse.json({ records: [] })
    }

    const records = (data ?? []).map(row => ({
      id:      row.id      as number,
      period:  row.period  as string,
      numbers: row.numbers as number[],
      date:    row.saved_at as string,
    }))

    return NextResponse.json({ records })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[history] GET exception:', msg)
    return NextResponse.json({ records: [], error: msg })
  }
}

export async function POST(req: Request) {
  const body = await req.json() as { period?: string; numbers?: number[]; game?: string }
  const { period, numbers, game = 'tw539' } = body

  if (!period || !Array.isArray(numbers) || numbers.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  try {
    const db = getServerClient()

    const { error } = await db
      .from('user_history')
      .insert({ period, numbers, game })

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

// DELETE /api/history
// 以 Supabase Primary Key (id) 精確刪除單筆紀錄
// 絕不以 period 刪除（避免誤刪重複期數的其他紀錄）
export async function DELETE(req: Request) {
  const body = await req.json() as { id?: number }
  const { id } = body

  if (typeof id !== 'number' || !Number.isFinite(id)) {
    return NextResponse.json({ error: 'id must be a finite number' }, { status: 400 })
  }

  try {
    const db = getServerClient()

    const { error } = await db
      .from('user_history')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[history] DELETE error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[history] DELETE: removed record id=${id}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[history] DELETE exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
