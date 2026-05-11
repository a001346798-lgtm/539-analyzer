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
// 密西根 Fantasy 5 ── 官方網站 GraphQL API 爬蟲
//
// 主策略：michiganlottery.com 內部 GraphQL API（Apollo Server）
//   Endpoint : https://www.michiganlottery.com/api/v1/
//   Query    : winningNumbers(logicalGameIdentifier:"FANTASY_5", drawDate:"YYYY-MM-DD")
//   ├─ logicalGameIdentifier = "FANTASY_5"（限定主開獎，Double Play 從根本排除）
//   └─ drawDate = 密西根本地日期（ET），無開獎日（週日/假日）回傳 null
//
// 備援策略：官方 API 失敗時退回 lottonumbers.com HTML 爬蟲
//
// 時差校正（精確 DST）：
//   EDT = UTC-4（3月第2個週日 → 11月第1個週日）
//   EST = UTC-5（其餘時間）
//   Fantasy 5 開獎約 7:29pm ET；查詢和寫入均使用密西根本地日期
// ════════════════════════════════════════════════════════════

// GraphQL endpoint — Content-Type: application/json 是繞過 CSRF 的關鍵
const MI_GQL_URL     = 'https://www.michiganlottery.com/api/v1/'
const MI_GQL_HEADERS = {
  'Content-Type':    'application/json',
  'Accept':          'application/json',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer':         'https://www.michiganlottery.com/',
}

// 精準 DST：計算密西根某個 UTC 時刻是否處於夏令時
function michiganOffsetHours(utcDate: Date): number {
  const y = utcDate.getUTCFullYear()

  // 3月第2個週日 02:00 EST = 07:00 UTC
  const mar1   = new Date(Date.UTC(y, 2, 1))
  const mar1Dow = mar1.getUTCDay()                            // 0=Sun
  const secondSunMar = 1 + (7 - mar1Dow) % 7 + 7             // first + 7
  const dstStart = new Date(Date.UTC(y, 2, secondSunMar, 7)) // 07:00 UTC

  // 11月第1個週日 02:00 EDT = 06:00 UTC
  const nov1    = new Date(Date.UTC(y, 10, 1))
  const nov1Dow = nov1.getUTCDay()
  const firstSunNov = 1 + (7 - nov1Dow) % 7
  const dstEnd  = new Date(Date.UTC(y, 10, firstSunNov, 6))  // 06:00 UTC

  return utcDate >= dstStart && utcDate < dstEnd ? 4 : 5     // EDT=4, EST=5
}

// 將任意日期字串轉為密西根本地日期 "YYYY/MM/DD"
function toMichiganDate(raw: string): string {
  if (!raw) return ''

  // 純日期 YYYY-MM-DD 或 YYYY/MM/DD
  const plainISO = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
  if (plainISO) return `${plainISO[1]}/${plainISO[2]}/${plainISO[3]}`

  // MM/DD/YYYY（美式）
  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usDate) {
    return `${usDate[3]}/${usDate[1].padStart(2,'0')}/${usDate[2].padStart(2,'0')}`
  }

  // ISO UTC (含 T/Z) → 轉換為密西根本地時間
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''

  const offsetH = michiganOffsetHours(d)
  const et = new Date(d.getTime() - offsetH * 3_600_000)
  const yyyy = et.getUTCFullYear()
  const mm   = String(et.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(et.getUTCDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}`
}

// ────────────────────────────────────────────────────────────
// 官方 GraphQL API：查詢單一日期的 Fantasy 5 開獎號碼
//
// 已驗證的 GraphQL 查詢格式：
//   winningNumbers(logicalGameIdentifier:"FANTASY_5", drawDate:"YYYY-MM-DD")
//   { drawNumbers }
//
// drawNumbers：5 個整數陣列（1-39），無開獎日（週日/假日）回傳 null
// logicalGameIdentifier = "FANTASY_5" 只取主開獎，Double Play 從根本排除
// ────────────────────────────────────────────────────────────
async function fetchOneMiDraw(drawDate: string): Promise<OfficialDraw | null> {
  const query = `{ winningNumbers(logicalGameIdentifier: "FANTASY_5", drawDate: "${drawDate}") { drawNumbers } }`

  try {
    const { data: res } = await axios.post<{
      data?: { winningNumbers?: { drawNumbers: number[] | null } }
    }>(MI_GQL_URL, { query }, {
      headers: MI_GQL_HEADERS,
      timeout: 12_000,
    })

    const nums = res?.data?.winningNumbers?.drawNumbers
    if (!Array.isArray(nums) || nums.length !== 5) return null
    if (!nums.every(n => Number.isInteger(n) && n >= 1 && n <= 39)) return null

    const [yyyy, mm, dd] = drawDate.split('-')
    return {
      period:  `${yyyy}${mm}${dd}`,
      date:    `${yyyy}/${mm}/${dd}`,
      numbers: [...nums].sort((a, b) => a - b),
    }
  } catch {
    return null   // 網路錯誤或速率限制時靜默跳過
  }
}

// ────────────────────────────────────────────────────────────
// 官方爬蟲主邏輯：向官方 GraphQL API 查詢過去 N 天
//
// 策略：生成過去 90 天（密西根本地日期）→ 分批 14 個同時查詢
//       → 過濾 null（無開獎日）→ 排序最新優先
//
// 驗證碼（打在終端機）：
//   印出 API 實際返回的原始資料樣本供確認
// ────────────────────────────────────────────────────────────
async function scrapeMiFantasy5Official(): Promise<OfficialDraw[]> {
  const HISTORY_DAYS = 90
  const BATCH_SIZE   = 14

  // 計算「今天」在密西根時區的日期（UTC 減去 ET 偏移）
  const nowUtc   = new Date()
  const offsetH  = michiganOffsetHours(nowUtc)
  const miNow    = new Date(nowUtc.getTime() - offsetH * 3_600_000)

  // 生成過去 HISTORY_DAYS 天的密西根本地日期列表
  const dates: string[] = []
  for (let i = 1; i <= HISTORY_DAYS; i++) {
    const d = new Date(miNow)
    d.setUTCDate(d.getUTCDate() - i)
    const yyyy = d.getUTCFullYear()
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd   = String(d.getUTCDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
  }

  console.log(`[mi-official] 查詢 ${dates.length} 天的開獎紀錄`)
  console.log(`[mi-official] 範圍: ${dates[dates.length - 1]} → ${dates[0]}`)

  const allDraws: OfficialDraw[] = []

  // 分批並行查詢（每批 BATCH_SIZE 個，防止速率限制）
  for (let i = 0; i < dates.length; i += BATCH_SIZE) {
    const batch   = dates.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(fetchOneMiDraw))
    allDraws.push(...results.filter((d): d is OfficialDraw => d !== null))
  }

  if (allDraws.length === 0) {
    throw new Error('官方 GraphQL API 返回 0 筆開獎資料')
  }

  const sorted = allDraws.sort((a, b) => b.period.localeCompare(a.period))

  // ── 印出原始資料樣本供驗證 ──
  console.log(`\n[mi-official] ✅ 成功取得 ${sorted.length} 期 Fantasy 5 開獎資料`)
  console.log('[mi-official] 原始資料樣本（最新 5 期）↓')
  sorted.slice(0, 5).forEach(d =>
    console.log(`  ${d.date} [${d.numbers.join(', ')}]`)
  )

  return sorted
}

// ────────────────────────────────────────────────────────────
// 備援：lottonumbers.com HTML 爬蟲（原有邏輯，完整保留）
// ────────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseMiFantasy5Html(html: string): OfficialDraw[] {
  const $ = cheerio.load(html)
  const draws: OfficialDraw[] = []
  let rowIdx = 0

  $('table.past-results tbody tr, table.mobFormat tbody tr').each((_, row) => {
    rowIdx++
    if ($(row).find('td.monthRow').length > 0) return
    if ($(row).text().toLowerCase().includes('double')) {
      console.log(`[mi-html] row ${rowIdx}: skip (double play)`)
      return
    }

    let date = '', period = ''
    const payoutsHref = $(row).find('td.link-row a').attr('href') ?? ''
    const hrefM = payoutsHref.match(/(\d{2})-(\d{2})-(\d{4})$/)
    if (hrefM) {
      const [, mm, dd, yyyy] = hrefM
      date   = `${yyyy}/${mm}/${dd}`
      period = `${yyyy}${mm}${dd}`
    } else {
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
    if (!date) return

    const nums: number[] = []
    $(row).find('td.balls-row li.ball').each((_, li) => {
      const n = parseInt($(li).text().trim(), 10)
      if (Number.isInteger(n) && n >= 1 && n <= 39) nums.push(n)
    })
    if (nums.length === 5) draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
  })

  return deduplicate(draws)
}

async function scrapeMiFantasy5Fallback(): Promise<OfficialDraw[]> {
  const currentYear = new Date().getFullYear()
  const allDraws: OfficialDraw[] = []
  const errors: string[] = []

  for (const year of [currentYear, currentYear - 1]) {
    const url = `https://lottonumbers.com/michigan-fantasy-5/numbers/${year}`
    console.log(`[mi-fallback] 嘗試 lottonumbers.com/${year}: ${url}`)
    try {
      const { data: html, status } = await axios.get<string>(url, {
        headers: { ...REQUEST_HEADERS, 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 25_000, maxRedirects: 5,
      })
      console.log(`[mi-fallback] HTTP ${status} ← lottonumbers.com/${year}`)
      const draws = parseMiFantasy5Html(html)
      console.log(`[mi-fallback] ✅ 解析 ${draws.length} 筆`)
      allDraws.push(...draws)
    } catch (e: unknown) {
      const detail = e instanceof AxiosError
        ? (e.response?.status ? `HTTP ${e.response.status}` : `網路: ${e.code ?? e.message}`)
        : (e instanceof Error ? e.message : '未知')
      console.error(`[mi-fallback] ❌ lottonumbers.com/${year} → ${detail}`)
      errors.push(detail)
    }
  }

  const result = deduplicate(allDraws).sort((a, b) => b.period.localeCompare(a.period))
  if (result.length === 0) throw new Error(`備援也失敗：${errors.join(' | ')}`)
  return result
}

// 主入口：官方 API 優先，失敗則用備援
async function scrapeMiFantasy5(): Promise<OfficialDraw[]> {
  console.log('\n[mi] ══ 開始爬取 Michigan Fantasy 5（優先使用官方 API）══')
  try {
    return await scrapeMiFantasy5Official()
  } catch (officialErr) {
    const msg = officialErr instanceof Error ? officialErr.message : String(officialErr)
    console.warn(`\n[mi] 官方 API 全部失敗，切換備援來源\n  原因：${msg}`)
    return scrapeMiFantasy5Fallback()
  }
}

// ════════════════════════════════════════════════════════════
// 加州 Fantasy 5 爬蟲
//
// 主策略：AllOrigins proxy → CA Lottery 官方 JSON API
//   proxy  : https://api.allorigins.win/raw?url=TARGET
//   target : calottery.com/api/DrawGameApi/DrawGamePastDrawResults/9/{page}/25
//   透過第三方跳板繞過 Vercel 資料中心 IP 的 WAF 封鎖
//
// 備援策略：corsproxy.io → california.lottonumbers.com（再失敗 → lottery.net）
//   proxy  : https://corsproxy.io/?encodeURIComponent(TARGET)
// ════════════════════════════════════════════════════════════

// 透過 Proxy 請求時使用精簡 Headers（Proxy 本身會補齊其餘欄位）
const CA_PROXY_HEADERS = {
  'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':        'text/html,application/json,*/*;q=0.8',
  'Cache-Control': 'no-cache, no-store',
  'Pragma':        'no-cache',
}

// ── 解析器 A：calottery.com 官方 JSON ─────────────────────
// DrawDate: /Date(ms)/ 或 ISO 字串；WinningNumbers: "01 02 03 04 05"
// 以 Intl.DateTimeFormat 轉為 CA 本地日期（America/Los_Angeles，含 DST）
function parseCaOfficialJson(raw: unknown): OfficialDraw[] {
  let obj: { DrawGamePastDrawResults?: Array<{ DrawDate: string; WinningNumbers: string }> }
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return [] }
  } else {
    obj = raw as typeof obj
  }

  const results = obj?.DrawGamePastDrawResults
  if (!Array.isArray(results) || results.length === 0) return []

  const draws: OfficialDraw[] = []
  for (const row of results) {
    let dateObj: Date | null = null
    const netMs = String(row.DrawDate).match(/\/Date\((-?\d+)\)\//)
    if (netMs) {
      dateObj = new Date(parseInt(netMs[1], 10))
    } else {
      const d = new Date(row.DrawDate)
      if (!isNaN(d.getTime())) dateObj = d
    }
    if (!dateObj) continue

    const caDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(dateObj)
    const [yyyy, mm, dd] = caDate.split('-')
    const date   = `${yyyy}/${mm}/${dd}`
    const period = `${yyyy}${mm}${dd}`

    const nums = String(row.WinningNumbers)
      .split(/[\s,]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => n >= 1 && n <= 39)

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    }
  }
  return draws
}

// ── 解析器 B：california.lottonumbers.com ─────────────────
// 4 欄 table，日期 "MM/DD/YYYY"，號碼 <ul><li>n</li>...</ul>
function parseCaLottonumbers(html: string): OfficialDraw[] {
  const $     = cheerio.load(html)
  const draws: OfficialDraw[] = []

  $('table tr').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return

    const dateText = $(cells.eq(0)).text().trim()
    const dateM    = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!dateM) return

    const mm   = dateM[1].padStart(2, '0')
    const dd   = dateM[2].padStart(2, '0')
    const yyyy = dateM[3]
    const date   = `${yyyy}/${mm}/${dd}`
    const period = `${yyyy}${mm}${dd}`

    const nums: number[] = []
    $(cells.eq(1)).find('li').each((_, li) => {
      const n = parseInt($(li).text().trim(), 10)
      if (n >= 1 && n <= 39) nums.push(n)
    })

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    }
  })

  return draws
}

// ── 解析器 C：lottery.net ─────────────────────────────────
// dl 結構，日期嵌在 href="/california/fantasy-5/numbers/MM-DD-YYYY"
// 號碼為 <ul><li>n</li>...</ul>，透過向上尋訪祖先找到 5 個合法號碼
function parseLotteryNet(html: string): OfficialDraw[] {
  const $    = cheerio.load(html)
  const draws: OfficialDraw[] = []
  const seen = new Set<string>()

  $('a[href*="/fantasy-5/numbers/"]').each((_, a) => {
    const href  = $(a).attr('href') ?? ''
    const dateM = href.match(/\/(\d{2})-(\d{2})-(\d{4})$/)
    if (!dateM) return

    const [, mm, dd, yyyy] = dateM
    const period = `${yyyy}${mm}${dd}`
    if (seen.has(period)) return
    seen.add(period)

    const date = `${yyyy}/${mm}/${dd}`

    // 向上最多 8 層祖先，找到包含恰好 5 個 1-39 整數的 <li> 集合
    let nums: number[] = []
    let cur = $(a).parent()
    for (let depth = 0; depth < 8 && nums.length !== 5; depth++) {
      const candidates = cur.find('li').map((_, li) => {
        const t = $(li).text().trim()
        const n = parseInt(t, 10)
        return (Number.isInteger(n) && n >= 1 && n <= 39 && /^\d+$/.test(t)) ? n : NaN
      }).get().filter((n): n is number => !isNaN(n))

      if (candidates.length === 5) nums = candidates
      else cur = cur.parent()
    }

    if (nums.length === 5) {
      draws.push({ period, date, numbers: nums.sort((a, b) => a - b) })
    }
  })

  return draws
}

// ── 策略 1：AllOrigins proxy → calottery.com JSON API ─────
// allorigins.win 以境外 IP 代理請求，繞過 Vercel 資料中心封鎖
async function scrapeCaViaAllOrigins(): Promise<OfficialDraw[]> {
  const PAGE_SIZE = 25
  const PAGES     = 4      // 4 × 25 = 最多 100 筆 ≈ 4 個月
  const allDraws: OfficialDraw[] = []

  for (let page = 1; page <= PAGES; page++) {
    const target   = `https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/9/${page}/${PAGE_SIZE}?_t=${Date.now()}`
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}&_t=${Date.now()}`
    console.log(`[ca-allorigins] Page ${page} 準備請求：${proxyUrl}`)

    try {
      const { data, status } = await axios.get<unknown>(proxyUrl, {
        headers: CA_PROXY_HEADERS,
        timeout: 20_000,
      })
      console.log(`[ca-allorigins] HTTP ${status} ← allorigins.win (page ${page})`)

      const draws = parseCaOfficialJson(data)
      console.log(`[ca-allorigins] parseCaOfficialJson → ${draws.length} 筆`)
      allDraws.push(...draws)

      // 已到最後一頁
      const arr = (data as { DrawGamePastDrawResults?: unknown[] })?.DrawGamePastDrawResults
      if (Array.isArray(arr) && arr.length < PAGE_SIZE) break
    } catch (e: unknown) {
      const ae     = e instanceof AxiosError
      const code   = ae ? (e.code ?? '') : ''
      const status = ae ? (e.response?.status ?? '') : ''
      const detail = status ? `HTTP ${status}` : `網路: ${code || (e instanceof Error ? e.message : '未知')}`
      console.error(`[ca-allorigins] ❌ Page ${page} → ${detail}`)
      if (ae && e.response?.data) {
        console.error(`               response: ${String(e.response.data).slice(0, 300)}`)
      }
      if (page === 1) throw new Error(`AllOrigins 第1頁失敗：${detail}`)
      break  // 後續頁失敗時以目前資料為主
    }
  }

  const result = deduplicate(allDraws).sort((a, b) => b.period.localeCompare(a.period))
  if (result.length === 0) throw new Error('AllOrigins + CA API 解析 0 筆（API 結構可能已變更）')

  console.log(`\n[ca] ✅ 成功從 allorigins.win → calottery.com 抓取，最新一期日期為：${result[0]?.date ?? '未知'}`)
  console.log(`[ca-allorigins] 共 ${result.length} 期，樣本（最新 5 期）↓`)
  result.slice(0, 5).forEach(d => console.log(`  ${d.date} [${d.numbers.join(', ')}]`))
  return result
}

// ── 策略 2：corsproxy.io → lottonumbers / lottery.net ──────
// 先嘗試 california.lottonumbers.com；仍空則再試 lottery.net
async function scrapeCaViaCorsproxy(): Promise<OfficialDraw[]> {
  const currentYear = new Date().getFullYear()
  const allErrors: string[] = []

  // ── corsproxy → california.lottonumbers.com ──
  const ltnDraws: OfficialDraw[] = []
  for (const year of [currentYear, currentYear - 1]) {
    const target   = `https://california.lottonumbers.com/fantasy-5/past-numbers/${year}?_t=${Date.now()}`
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`
    console.log(`[ca-corsproxy-A] 準備請求：${proxyUrl}`)
    try {
      const { data: html, status } = await axios.get<string>(proxyUrl, {
        headers: CA_PROXY_HEADERS,
        timeout: 20_000,
      })
      console.log(`[ca-corsproxy-A] HTTP ${status} ← corsproxy→lottonumbers/${year}  (size: ${html.length})`)
      const draws = parseCaLottonumbers(html)
      console.log(`[ca-corsproxy-A] parseCaLottonumbers → ${draws.length} 筆`)
      ltnDraws.push(...draws)
    } catch (e: unknown) {
      const ae     = e instanceof AxiosError
      const code   = ae ? (e.code ?? '') : ''
      const status = ae ? (e.response?.status ?? '') : ''
      const detail = status ? `HTTP ${status}` : `網路: ${code || (e instanceof Error ? e.message : '未知')}`
      console.error(`[ca-corsproxy-A] ❌ ${target}`)
      console.error(`                → ${detail}`)
      if (ae && e.response?.data) {
        console.error(`                response: ${String(e.response.data).slice(0, 300)}`)
      }
      allErrors.push(`lottonumbers/${year}: ${detail}`)
    }
  }

  if (ltnDraws.length > 0) {
    const result = deduplicate(ltnDraws).sort((a, b) => b.period.localeCompare(a.period))
    console.log(`\n[ca] ✅ 成功從 corsproxy.io → california.lottonumbers.com 抓取，最新一期日期為：${result[0]?.date ?? '未知'}`)
    console.log(`[ca-corsproxy-A] 共 ${result.length} 期，樣本（最新 5 期）↓`)
    result.slice(0, 5).forEach(d => console.log(`  ${d.date} [${d.numbers.join(', ')}]`))
    return result
  }

  // ── corsproxy → lottery.net（最終備援）──
  console.warn('[ca-corsproxy-B] lottonumbers 全部失敗，嘗試 lottery.net …')
  const lnDraws: OfficialDraw[] = []
  for (const year of [currentYear, currentYear - 1]) {
    const target   = `https://www.lottery.net/california/fantasy-5/numbers/${year}?_t=${Date.now()}`
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`
    console.log(`[ca-corsproxy-B] 準備請求：${proxyUrl}`)
    try {
      const { data: html, status } = await axios.get<string>(proxyUrl, {
        headers: CA_PROXY_HEADERS,
        timeout: 20_000,
      })
      console.log(`[ca-corsproxy-B] HTTP ${status} ← corsproxy→lottery.net/${year}  (size: ${html.length})`)
      const draws = parseLotteryNet(html)
      console.log(`[ca-corsproxy-B] parseLotteryNet → ${draws.length} 筆`)
      lnDraws.push(...draws)
    } catch (e: unknown) {
      const ae     = e instanceof AxiosError
      const code   = ae ? (e.code ?? '') : ''
      const status = ae ? (e.response?.status ?? '') : ''
      const detail = status ? `HTTP ${status}` : `網路: ${code || (e instanceof Error ? e.message : '未知')}`
      console.error(`[ca-corsproxy-B] ❌ ${target}`)
      console.error(`                → ${detail}`)
      allErrors.push(`lottery.net/${year}: ${detail}`)
    }
  }

  const result = deduplicate(lnDraws).sort((a, b) => b.period.localeCompare(a.period))
  if (result.length === 0) {
    throw new Error(`corsproxy 全部失敗：${allErrors.join(' | ')}`)
  }

  console.log(`\n[ca] ✅ 成功從 corsproxy.io → lottery.net 抓取，最新一期日期為：${result[0]?.date ?? '未知'}`)
  console.log(`[ca-corsproxy-B] 共 ${result.length} 期，樣本（最新 5 期）↓`)
  result.slice(0, 5).forEach(d => console.log(`  ${d.date} [${d.numbers.join(', ')}]`))
  return result
}

// ── 主入口：AllOrigins → corsproxy ───────────────────────
async function scrapeCaFantasy5(): Promise<OfficialDraw[]> {
  console.log('\n[ca] ══ 開始爬取 California Fantasy 5 ══')

  try {
    return await scrapeCaViaAllOrigins()
  } catch (e1) {
    console.warn(`[ca] AllOrigins 失敗：${e1 instanceof Error ? e1.message : e1}`)
    console.warn('[ca] 切換備援：corsproxy.io …')
  }

  return scrapeCaViaCorsproxy()
}

function getDrawTable(game: string): string {
  if (game === 'mi_fantasy5') return 'mi_fantasy5_draws'
  if (game === 'ca_fantasy5') return 'ca_fantasy5_draws'
  return 'official_draws'
}

// ════════════════════════════════════════════════════════════
// GET /api/fetch-draws?game=tw539|mi_fantasy5|ca_fantasy5
// ════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const game = searchParams.get('game') ?? 'tw539'
  const table = getDrawTable(game)

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
// POST /api/fetch-draws?game=tw539|mi_fantasy5|ca_fantasy5
// ════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const game  = searchParams.get('game') ?? 'tw539'
  const table = getDrawTable(game)

  try {
    const draws = game === 'mi_fantasy5'
      ? await scrapeMiFantasy5()
      : game === 'ca_fantasy5'
        ? await scrapeCaFantasy5()
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
