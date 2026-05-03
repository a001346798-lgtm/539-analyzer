'use client'
import { useEffect, useState, useCallback } from 'react'
import { useLotteryStore } from '@/store/useLotteryStore'

interface Draw {
  period: string
  date: string
  session?: string   // 舊版 mock data 的欄位，相容保留
  numbers: number[]
}

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

// 色球統計：n%3=1→紅, n%3=2→藍, n%3=0→綠，0個不顯示
function colorSummary(numbers: number[]): { red: number; blue: number; green: number } {
  let red = 0, blue = 0, green = 0
  numbers.forEach(n => {
    if (n % 3 === 1) red++
    else if (n % 3 === 2) blue++
    else green++
  })
  return { red, blue, green }
}

export default function LatestDraw() {
  const [draws, setDraws]       = useState<Draw[]>([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading]   = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [isError, setIsError]   = useState(false)

  const loadOfficialMissing = useLotteryStore(s => s.loadOfficialMissing)
  const bumpBacktest        = useLotteryStore(s => s.bumpBacktest)

  // 載入開獎資料：優先讀官方 official-draws.json，若無則顯示 mock
  const loadDraws = useCallback(async () => {
    try {
      const res  = await fetch('/api/fetch-draws')
      const data = await res.json() as { draws?: Draw[]; updatedAt?: string }

      if (data.draws && data.draws.length > 0) {
        setDraws(data.draws.slice(0, 8))
        setUpdatedAt(data.updatedAt ?? '')
        return
      }
      // fallback: 顯示 mock 資料（尚未爬取時）
      const mock = await fetch('/api/draws')
      const mockData = await mock.json() as { draws?: Draw[] }
      setDraws(mockData.draws?.slice(0, 8) ?? [])
      setUpdatedAt('')
    } catch {}
  }, [])

  // 頁面掛載：載入資料 + 同步遺漏值至主號碼池
  useEffect(() => {
    loadDraws()
    loadOfficialMissing()
  }, [loadDraws, loadOfficialMissing])

  // 點擊「更新開獎資料」：觸發爬蟲 POST → 重讀資料 + 同步遺漏值
  const handleUpdate = async () => {
    setLoading(true)
    setStatusMsg('')
    setIsError(false)
    try {
      const res  = await fetch('/api/fetch-draws', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; count?: number; error?: string }

      if (!res.ok || data.error) throw new Error(data.error ?? '伺服器錯誤')

      setStatusMsg(`已取得 ${data.count} 期資料`)
      await loadDraws()
      await loadOfficialMissing()   // 同步最新遺漏值到主號碼池
      bumpBacktest()                // 通知勝率面板重算
    } catch (e) {
      setIsError(true)
      setStatusMsg(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-white font-bold text-base">歷史開獎紀錄</h2>
          {updatedAt && (
            <span className="text-[10px] text-gray-500">
              資料更新：{new Date(updatedAt).toLocaleString('zh-TW', {
                month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {statusMsg && (
            <span className={`text-xs ${isError ? 'text-red-400' : 'text-emerald-400'}`}>
              {statusMsg}
            </span>
          )}
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded transition-colors"
          >
            {loading ? '爬取中…' : '更新開獎資料'}
          </button>
          <span className="text-[10px] text-gray-500 bg-gray-700 px-2 py-0.5 rounded">近 8 期</span>
        </div>
      </div>

      {/* Draw list */}
      {draws.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">
          尚無開獎資料 — 點擊「更新開獎資料」自動抓取
        </p>
      ) : (
        <div className="space-y-2">
          {draws.map(draw => {
            const oddCount  = draw.numbers.filter(n => n % 2 === 1).length
            const evenCount = draw.numbers.length - oddCount
            const { red, blue, green } = colorSummary(draw.numbers)
            return (
              <div
                key={draw.period}
                className="bg-gray-700/60 rounded-lg px-3 py-2 flex items-center gap-3"
              >
                {/* Period + date */}
                <div className="flex flex-col flex-shrink-0 w-[4.5rem]">
                  <span className="text-gray-300 text-[10px] font-mono leading-tight">
                    {draw.period}
                  </span>
                  <span className="text-gray-500 text-[9px] leading-tight">
                    {draw.date}{draw.session ? ` ${draw.session}` : ''}
                  </span>
                </div>

                {/* Balls + single/double labels */}
                <div className="flex gap-2 flex-1 justify-center">
                  {draw.numbers.map(n => (
                    <div key={n} className="flex flex-col items-center gap-0.5">
                      <div
                        className={`w-8 h-8 rounded-full ${ballColor(n)} flex items-center justify-center text-white font-bold text-xs shadow-sm`}
                      >
                        {String(n).padStart(2, '0')}
                      </div>
                      <span
                        className={`text-[8px] font-semibold leading-none ${
                          n % 2 === 1 ? 'text-amber-400' : 'text-sky-400'
                        }`}
                      >
                        {n % 2 === 1 ? '單' : '雙'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Right column: odd/even + color summary */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0 w-14">
                  <span className="text-[10px] text-gray-500">
                    {oddCount}單{evenCount}雙
                  </span>
                  <span className="text-[10px] flex items-center gap-0.5">
                    {red   > 0 && <span className="text-red-400">{red}紅</span>}
                    {blue  > 0 && <span className="text-sky-400">{blue}藍</span>}
                    {green > 0 && <span className="text-emerald-400">{green}綠</span>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
