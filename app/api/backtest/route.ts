import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase'

function toYMD(d: string): string {
  return d.replace(/\//g, '-').slice(0, 10)
}

// 將 UTC 時間戳轉換為密西根本地日期（America/Detroit，自動處理 DST）
// 密西根 7:29pm ET 開獎 = 隔天 7:29am（EDT）/ 8:29am（EST）台灣時間
// 所以台灣用戶存檔時，UTC saved_at 對應的密西根日期即為該期開獎日期
function toMichiganDate(utcStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date(utcStr))
  } catch {
    return toYMD(utcStr)
  }
}

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
  const officialTable = game === 'mi_fantasy5' ? 'mi_fantasy5_draws' : 'official_draws'

  try {
    const db = getServerClient()

    const [histResult, offResult] = await Promise.all([
      db.from('user_history')
        .select('period, numbers, saved_at')
        .eq('game', game)
        .order('saved_at', { ascending: true }),

      db.from(officialTable)
        .select('period, date, numbers')
        .order('date', { ascending: false }),
    ])

    if (histResult.error) console.error('[backtest] user_history error:', histResult.error.message)
    if (offResult.error)  console.error('[backtest] official error:', offResult.error.message)

    const histRows = histResult.data ?? []
    const offRows  = offResult.data  ?? []

    // 建立 date → official draw 的查找表
    const byDate = new Map<string, { numbers: number[]; period: string; date: string }>()
    for (const r of offRows) {
      byDate.set(toYMD(r.date as string), {
        numbers: r.numbers as number[],
        period:  r.period  as string,
        date:    r.date    as string,
      })
    }

    const details: BacktestDetail[] = []
    let wins = 0, losses = 0, unmatched = 0

    for (const rec of histRows) {
      // 密西根遊戲：將 UTC saved_at 轉換為密西根本地日期後比對
      // 今彩539：直接取 UTC 日期（台灣存檔時間與開獎日期同步）
      const lookupDate = game === 'mi_fantasy5'
        ? toMichiganDate(rec.saved_at as string)
        : toYMD(rec.saved_at as string)

      const official = byDate.get(lookupDate)
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
