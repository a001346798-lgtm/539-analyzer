import { NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'
import * as cheerio from 'cheerio'
import { getServerClient } from '@/lib/supabase'

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
// 遺漏值計算
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

function deduplicate(draws: OfficialDraw[]): OfficialDraw[] {
  const seen = new Set<string>()
  return draws.filter(d => !seen.has(d.period) && seen.add(d.period))
}

// ════════════════════════════════════════════════════════════
// 今彩 539 爬蟲
// ════════════════════════════════════════════════════════════

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

const TW539_SOURCES: Array<{ url: string; label: string; parser: (h: string) => OfficialDraw[] }> = [
  { url: 'https://www.lotto-8.com/listLto539.asp',                         label: 'lotto-8.com',  parser: parseLotto8 },
  { url: 'https://www.pilio.idv.tw/lto539/list.asp?indexpage=1&orderby=1', label: 'pilio.idv.tw', parser: parsePilio  },
]

async function scrapeTw539(): Promise<OfficialDraw[]> {
  const errors: string[] = []

  for (const { url, label, parser } of TW539_SOURCES) {
    console.log(`[fetch-draws/539] 嘗試 [${label}]: ${url}`)
    try {
      const { data: html, status } = await axios.get<string>(url, {
        headers: REQUEST_HEADERS, timeout: 20_000,
        responseEncoding: 'binary', maxRedirects: 5,
      })
      console.log(`[fetch-draws/539] HTTP ${status} ← [${label}]`)

      const draws = deduplicate(parser(html))
      if (draws.length > 0) {
        console.log(`[fetch-draws/539] ✅ [${label}] ${draws.length} 期，最新 ${draws[0].date}`)
        return draws
      }

      const msg = `HTTP ${status} 成功但解析 0 筆`
      console.warn(`[fetch-draws/539] ⚠️  [${label}]: ${msg}`)
      errors.push(`[${label}] ${msg}`)
    } catch (e: unknown) {
      let detail = '未知錯誤'
      if (e instanceof AxiosError) {
        const code = e.response?.status
        detail = code ? `HTTP ${code}` : `網路錯誤：${e.code ?? e.message}`
      } else if (e instanceof Error) {
        detail = e.message
      }
      console.error(`[fetch-draws/539] ❌ [${label}] ${url} → ${detail}`)
      errors.push(`[${label}] ${detail}`)
    }
  }

  throw new Error(`所有來源均失敗。詳細：${errors.join(' | ')}`)
}

// ════════════════════════════════════════════════════════════
// 密西根 Fantasy 5 爬蟲
//
// 目標：https://lottonumbers.com/michigan-fantasy-5/numbers/2026
// 嚴格排除 Double Play：任何含 "double" 字樣的 row 或 table 均跳過
//
// 時差說明：
//   密西根 ET（UTC-4 EDT / UTC-5 EST），開獎約 7:29pm ET
//   台灣 UTC+8：密西根 7:29pm = 隔天 7:29am（EDT）/ 8:29am（EST）
//   爬蟲寫入日期使用密西根本地日期（網站已顯示 Michigan 時間），無需轉換。
// ════════════════════════════════════════════════════════════

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
}

// ────────────────────────────────────────────────────────────
// 密西根 Fantasy 5 HTML 解析器（已依實際 DOM 結構校正）
//
// 實際結構（lottonumbers.com）：
//   <table class="mobFormat past-results">
//     <tbody>
//       <tr><td class="monthRow">May 2026</td></tr>   ← 月份分隔列
//       <tr>
//         <td class="date-row">Sat, May 2 2026</td>   ← 日期文字
//         <td class="balls-row">
//           <ul class="balls">
//             <li class="ball ball">7</li>             ← 號碼（1-39）
//             ...×5
//           </ul>
//         </td>
//         <td class="jp-row">...</td>
//         <td class="tw-row">...</td>
//         <td class="link-row">
//           <a href="/michigan-fantasy-5/numbers/05-02-2026">Payouts</a>
//         </td>
//       </tr>
//     </tbody>
//   </table>
//
// Double Play 在獨立 URL，此頁不存在，保留關鍵字過濾作安全防護。
// ────────────────────────────────────────────────────────────
function parseMiFantasy5(html: string): OfficialDraw[] {
  const $ = cheerio.load(html)
  const draws: OfficialDraw[] = []
  let rowIdx = 0

  // 精準選取 past-results 表格的每一個 tbody tr
  $('table.past-results tbody tr, table.mobFormat tbody tr').each((_, row) => {
    rowIdx++
    const rowSnippet = $(row).text().replace(/\s+/g, ' ').trim().slice(0, 100)
    console.log(`[mi-parser] row ${rowIdx}: "${rowSnippet}"`)

    // 跳過月份分隔列（含 td.monthRow）
    if ($(row).find('td.monthRow').length > 0) {
      console.log(`[mi-parser] row ${rowIdx}: skip (monthRow)`)
      return
    }

    // 安全防護：跳過任何含 "double" 字樣的列
    if ($(row).text().toLowerCase().includes('double')) {
      console.log(`[mi-parser] row ${rowIdx}: skip (double play)`)
      return
    }

    // ── 日期：優先從 Payouts 連結 href 提取 MM-DD-YYYY（最可靠）
    let date   = ''
    let period = ''

    const payoutsHref = $(row).find('td.link-row a').attr('href') ?? ''
    const hrefM = payoutsHref.match(/(\d{2})-(\d{2})-(\d{4})$/)
    if (hrefM) {
      const [, mm, dd, yyyy] = hrefM
      date   = `${yyyy}/${mm}/${dd}`
      period = `${yyyy}${mm}${dd}`
    } else {
      // Fallback：解析 td.date-row 文字 "Sat, May 2 2026"
      const dateText = $(row).find('td.date-row').text().trim()
      const dateM = dateText.match(/\w+,?\s+(\w+)\s+(\d{1,2})\s+(\d{4})/)
      if (dateM) {
        const month = MONTH_MAP[dateM[1].toLowerCase().slice(0, 3)]
        if (month) {
          date   = `${dateM[3]}/${month}/${dateM[2].padStart(2, '0')}`
          period = `${dateM[3]}${month}${dateM[2].padStart(2, '0')}`
        }
      }
    }

    if (!date) {
      console.log(`[mi-parser] row ${rowIdx}: no date found, skip`)
      return
    }

    // ── 號碼：td.balls-row ul.balls li.ball
    const nums: number[] = []
    $(row).find('td.balls-row li.ball').each((_, li) => {
      const n = parseInt($(li).text().trim(), 10)
      if (Number.isInteger(n) && n >= 1 && n <= 39) nums.push(n)
    })

    console.log(`[mi-parser] row ${rowIdx}: date=${date} nums=[${nums.join(',')}]`)

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    } else {
      console.log(`[mi-parser] row ${rowIdx}: expected 5 nums, got ${nums.length}, skip`)
    }
  })

  console.log(`[mi-parser] 完成：共解析 ${draws.length} 筆有效開獎`)
  return deduplicate(draws)
}

// 爬取當年與上一年，合併後去重
async function scrapeMiFantasy5(): Promise<OfficialDraw[]> {
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1]
  const allDraws: OfficialDraw[] = []
  const errors: string[] = []

  for (const year of years) {
    const url   = `https://lottonumbers.com/michigan-fantasy-5/numbers/${year}`
    const label = `lottonumbers.com/${year}`
    console.log(`[fetch-draws/mi] 嘗試 [${label}]: ${url}`)
    try {
      const { data: html, status } = await axios.get<string>(url, {
        headers: {
          ...REQUEST_HEADERS,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 25_000,
        maxRedirects: 5,
      })
      console.log(`[fetch-draws/mi] HTTP ${status} ← [${label}]`)

      const draws = parseMiFantasy5(html)
      console.log(`[fetch-draws/mi] ✅ [${label}] 解析 ${draws.length} 筆`)
      allDraws.push(...draws)
    } catch (e: unknown) {
      let detail = '未知錯誤'
      if (e instanceof AxiosError) {
        const code = e.response?.status
        detail = code ? `HTTP ${code}` : `網路錯誤：${e.code ?? e.message}`
      } else if (e instanceof Error) {
        detail = e.message
      }
      console.error(`[fetch-draws/mi] ❌ [${label}] → ${detail}`)
      errors.push(`[${label}] ${detail}`)
    }
  }

  const result = deduplicate(allDraws).sort((a, b) => b.period.localeCompare(a.period))

  if (result.length === 0) {
    throw new Error(`密西根資料爬取失敗：${errors.join(' | ')}`)
  }

  return result
}

// ════════════════════════════════════════════════════════════
// GET /api/fetch-draws?game=tw539|mi_fantasy5
// ════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const game = searchParams.get('game') ?? 'tw539'
  const table = game === 'mi_fantasy5' ? 'mi_fantasy5_draws' : 'official_draws'

  try {
    const db = getServerClient()

    const { data, error } = await db
      .from(table)
      .select('period, date, numbers, created_at')
      .order('date', { ascending: false })

    if (error) {
      console.error(`[fetch-draws] GET error (${table}):`, error.message)
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
    console.error(`[fetch-draws] GET exception (${table}):`, msg)
    return NextResponse.json({ draws: [], missing: {}, updatedAt: '', error: msg })
  }
}

// ════════════════════════════════════════════════════════════
// POST /api/fetch-draws?game=tw539|mi_fantasy5
// ════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const game  = searchParams.get('game') ?? 'tw539'
  const table = game === 'mi_fantasy5' ? 'mi_fantasy5_draws' : 'official_draws'

  try {
    const draws = game === 'mi_fantasy5'
      ? await scrapeMiFantasy5()
      : await scrapeTw539()

    const db  = getServerClient()
    const rows = draws.map(d => ({ period: d.period, date: d.date, numbers: d.numbers }))

    const { error } = await db
      .from(table)
      .upsert(rows, { onConflict: 'period', ignoreDuplicates: false })

    if (error) {
      console.error(`[fetch-draws] upsert error (${table}):`, error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[fetch-draws] ✅ upserted ${draws.length} rows into ${table}`)
    return NextResponse.json({ ok: true, count: draws.length })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[fetch-draws] POST exception (${table}):`, msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
