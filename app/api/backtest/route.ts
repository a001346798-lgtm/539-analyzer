import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

export interface BacktestDetail {
  period:          string
  myNumbers:       number[]
  officialNumbers: number[] | null
  officialPeriod:  string   | null
  officialDate:    string   | null
  hits:            number[]
  isWin:           boolean  | null
}

export interface BacktestResponse {
  total:     number
  wins:      number
  losses:    number
  unmatched: number
  winRate:   number
  details:   BacktestDetail[]
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const game         = searchParams.get('game') ?? 'tw539'
  const officialTable = game === 'mi_fantasy5' ? 'mi_fantasy5_draws'
                      : game === 'ca_fantasy5'  ? 'ca_fantasy5_draws'
                      : 'official_draws'

  try {
    const db = getServerClient()

    const [histResult, offResult] = await Promise.all([
      db.from('user_history')
        .select('period, numbers')
        .eq('game', game)
        .order('period', { ascending: true }),

      db.from(officialTable)
        .select('period, date, numbers')
        .order('date', { ascending: false }),
    ])

    if (histResult.error) console.error('[backtest] user_history error:', histResult.error.message)
    if (offResult.error)  console.error('[backtest] official error:', offResult.error.message)

    const histRows = histResult.data ?? []
    const offRows  = offResult.data  ?? []

    // 建立 period → official draw 的查找表（用期數精確比對，補登時不受存檔日期影響）
    const byPeriod = new Map<string, { numbers: number[]; period: string; date: string }>()
    for (const r of offRows) {
      byPeriod.set(r.period as string, {
        numbers: r.numbers as number[],
        period:  r.period  as string,
        date:    r.date    as string,
      })
    }

    const details: BacktestDetail[] = []
    let wins = 0, losses = 0, unmatched = 0

    for (const rec of histRows) {
      const official = byPeriod.get(rec.period as string)
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
      details: [...details].reverse(),
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
