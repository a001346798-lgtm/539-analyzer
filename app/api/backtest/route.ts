import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

// Normalise any date string → "YYYY-MM-DD"
// handles: "2026/04/30", "2026-04-30T08:00:00Z", "2026-04-30"
function toYMD(d: string): string {
  return d.replace(/\//g, '-').slice(0, 10)
}

export interface BacktestDetail {
  period:          string
  myNumbers:       number[]
  officialNumbers: number[] | null
  officialPeriod:  string   | null
  officialDate:    string   | null
  hits:            number[]
  isWin:           boolean  | null   // null = unmatched
}

export interface BacktestResponse {
  total:     number
  wins:      number
  losses:    number
  unmatched: number
  winRate:   number          // percentage, 1 decimal
  details:   BacktestDetail[]
}

export async function GET(): Promise<Response> {
  try {
    const db = getServerClient()

    // ── Fetch both tables in parallel ───────────────────────
    const [histResult, offResult] = await Promise.all([
      db.from('user_history')
        .select('period, numbers, saved_at')
        .order('saved_at', { ascending: true }),

      db.from('official_draws')
        .select('period, date, numbers')
        .order('date', { ascending: false }),
    ])

    if (histResult.error) console.error('[backtest] user_history error:', histResult.error.message)
    if (offResult.error)  console.error('[backtest] official_draws error:', offResult.error.message)

    const histRows = histResult.data ?? []
    const offRows  = offResult.data  ?? []

    // ── Build date → official draw lookup ───────────────────
    const byDate = new Map<string, { numbers: number[]; period: string; date: string }>()
    for (const r of offRows) {
      byDate.set(toYMD(r.date as string), {
        numbers: r.numbers as number[],
        period:  r.period  as string,
        date:    r.date    as string,
      })
    }

    // ── Cross-reference ──────────────────────────────────────
    const details: BacktestDetail[] = []
    let wins = 0, losses = 0, unmatched = 0

    for (const rec of histRows) {
      const saveDate = toYMD(rec.saved_at as string)
      const official = byDate.get(saveDate)
      const myNums   = rec.numbers as number[]

      if (!official) {
        unmatched++
        details.push({
          period: rec.period as string, myNumbers: myNums,
          officialNumbers: null, officialPeriod: null, officialDate: null,
          hits: [], isWin: null,
        })
        continue
      }

      const hits  = myNums.filter(n => official.numbers.includes(n))
      const isWin = hits.length === 0
      isWin ? wins++ : losses++

      details.push({
        period:          rec.period as string,
        myNumbers:       myNums,
        officialNumbers: official.numbers,
        officialPeriod:  official.period,
        officialDate:    official.date,
        hits,
        isWin,
      })
    }

    const total   = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0

    return NextResponse.json({
      total, wins, losses, unmatched, winRate,
      details: [...details].reverse(),   // most-recent save first
    } satisfies BacktestResponse)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[backtest] exception:', msg)
    return NextResponse.json({
      total: 0, wins: 0, losses: 0, unmatched: 0, winRate: 0,
      details: [], error: msg,
    })
  }
}
