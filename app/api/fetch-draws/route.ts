import { NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'
import * as cheerio from 'cheerio'
import { getServerClient } from '@/lib/supabase'

// official_draws schema:
//   id         BIGSERIAL PK
//   period     TEXT UNIQUE    e.g. "20260430"
//   date       TEXT           e.g. "2026/04/30"
//   numbers    INTEGER[]      e.g. [6, 15, 27, 30, 31]
//   created_at TIMESTAMPTZ DEFAULT now()

export interface OfficialDraw {
  period:  string
  date:    string
  numbers: number[]
}

export interface OfficialData {
  draws:     OfficialDraw[]
  missing:   Record<string, number>
  updatedAt: string
}

// ────────────────────────────────────────────────────────────
// 遺漏值計算：從最新一期往舊追，記錄每個號碼連續未出現的期數
// ────────────────────────────────────────────────────────────
function calcMissing(draws: OfficialDraw[]): Record<string, number> {
  const missing: Record<string, number> = {}
  for (let n = 1; n <= 39; n++) {
    let count = 0
    for (const draw of draws) {
      if (draw.numbers.includes(n)) break
      count++
    }
    missing[String(n)] = count
  }
  return missing
}

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
}

// ────────────────────────────────────────────────────────────
// 解析器 A：lotto-8.com（已驗證）
//   6-col 行：col0 = "2026/04/30 ..." col1-5 = 個別號碼
// ────────────────────────────────────────────────────────────
function parseLotto8(html: string): OfficialDraw[] {
  const $     = cheerio.load(html)
  const draws: OfficialDraw[] = []

  $('table tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length !== 6) return

    const col0  = $(cells.eq(0)).text()
    const dateM = col0.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dateM) return

    const date   = `${dateM[1]}/${dateM[2]}/${dateM[3]}`
    const period = `${dateM[1]}${dateM[2]}${dateM[3]}`
    const nums: number[] = []

    for (let i = 1; i <= 5; i++) {
      const n = parseInt($(cells.eq(i)).text().trim(), 10)
      if (n >= 1 && n <= 39) nums.push(n)
    }

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    }
  })

  return draws
}

// ────────────────────────────────────────────────────────────
// 解析器 B：pilio.idv.tw（已驗證，Big5 數字為 ASCII）
//   2-col 行：col0 = "04/3026(日)" col1 = "06, 15, 27, 30, 31"
// ────────────────────────────────────────────────────────────
function parsePilio(html: string): OfficialDraw[] {
  const $     = cheerio.load(html)
  const draws: OfficialDraw[] = []

  $('table tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length !== 2) return

    const col0    = $(cells.eq(0)).text().replace(/\s+/g, '')
    const col1    = $(cells.eq(1)).text()
    const dateM   = col0.match(/^(\d{2})\/(\d{2})(\d{2,4})/)
    if (!dateM) return

    const month   = dateM[1]
    const day     = dateM[2]
    const ySuffix = dateM[3].replace(/\D/g, '')
    const year    = ySuffix.length <= 2 ? `20${ySuffix}` : ySuffix
    const date    = `${year}/${month}/${day}`
    const period  = `${year}${month}${day}`

    const nums = (col1.match(/\d+/g) ?? [])
      .map(Number)
      .filter(n => n >= 1 && n <= 39)

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    }
  })

  return draws
}

const SOURCES: Array<{ url: string; label: string; parser: (h: string) => OfficialDraw[] }> = [
  { url: 'https://www.lotto-8.com/listLto539.asp',                       label: 'lotto-8.com', parser: parseLotto8 },
  { url: 'https://www.pilio.idv.tw/lto539/list.asp?indexpage=1&orderby=1', label: 'pilio.idv.tw', parser: parsePilio },
]

function deduplicate(draws: OfficialDraw[]): OfficialDraw[] {
  const seen = new Set<string>()
  return draws.filter(d => !seen.has(d.period) && seen.add(d.period))
}

// ────────────────────────────────────────────────────────────
// 主爬蟲：依序嘗試備援來源，每個 URL 獨立列印詳細錯誤
// ────────────────────────────────────────────────────────────
async function scrapeDraws(): Promise<OfficialDraw[]> {
  const errors: string[] = []

  for (const { url, label, parser } of SOURCES) {
    console.log(`[fetch-draws] 嘗試 [${label}]: ${url}`)
    try {
      const { data: html, status } = await axios.get<string>(url, {
        headers: REQUEST_HEADERS, timeout: 20_000,
        responseEncoding: 'binary', maxRedirects: 5,
      })
      console.log(`[fetch-draws] HTTP ${status} ← [${label}]`)

      const draws = deduplicate(parser(html))
      if (draws.length > 0) {
        console.log(`[fetch-draws] ✅ [${label}] ${draws.length} 期，最新 ${draws[0].date}`)
        return draws
      }

      const msg = `HTTP ${status} 成功但解析 0 筆`
      console.warn(`[fetch-draws] ⚠️  [${label}]: ${msg}`)
      errors.push(`[${label}] ${msg}`)
    } catch (e: unknown) {
      let detail = '未知錯誤'
      if (e instanceof AxiosError) {
        const code = e.response?.status
        detail = code ? `HTTP ${code}` : `網路錯誤：${e.code ?? e.message}`
      } else if (e instanceof Error) {
        detail = e.message
      }
      console.error(`[fetch-draws] ❌ [${label}] ${url} → ${detail}`)
      errors.push(`[${label}] ${detail}`)
    }
  }

  throw new Error(`所有來源均失敗。詳細：${errors.join(' | ')}`)
}

// ────────────────────────────────────────────────────────────
// GET /api/fetch-draws
// 從 Supabase official_draws 查詢，動態計算遺漏值後回傳
// ────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const db = getServerClient()

    const { data, error } = await db
      .from('official_draws')
      .select('period, date, numbers, created_at')
      .order('date', { ascending: false })  // 最新優先

    if (error) {
      console.error('[fetch-draws] GET error:', error.message)
      return NextResponse.json({ draws: [], missing: {}, updatedAt: '' })
    }

    const draws: OfficialDraw[] = (data ?? []).map(r => ({
      period:  r.period  as string,
      date:    r.date    as string,
      numbers: r.numbers as number[],
    }))

    const updatedAt = (data?.[0] as { created_at?: string } | null)?.created_at ?? ''

    return NextResponse.json({
      draws,
      missing:   calcMissing(draws),
      updatedAt,
    } satisfies OfficialData)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fetch-draws] GET exception:', msg)
    return NextResponse.json({ draws: [], missing: {}, updatedAt: '', error: msg })
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/fetch-draws
// 爬取最新資料 → upsert 到 Supabase official_draws
// ────────────────────────────────────────────────────────────
export async function POST() {
  try {
    const draws = await scrapeDraws()
    const db    = getServerClient()

    const rows = draws.map(d => ({
      period:  d.period,
      date:    d.date,
      numbers: d.numbers,
    }))

    // upsert：period 已存在則更新 date/numbers，不存在則插入
    const { error } = await db
      .from('official_draws')
      .upsert(rows, { onConflict: 'period', ignoreDuplicates: false })

    if (error) {
      console.error('[fetch-draws] upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[fetch-draws] ✅ upserted ${draws.length} rows into official_draws`)
    return NextResponse.json({ ok: true, count: draws.length })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fetch-draws] POST exception:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
