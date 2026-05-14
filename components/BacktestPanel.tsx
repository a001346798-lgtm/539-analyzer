'use client'
import { useState, useEffect, useCallback } from 'react'
import { useLotteryStore } from '@/store/useLotteryStore'
import type { BacktestDetail, BacktestResponse } from '@/app/api/backtest/route'

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

function Ball({ n, highlight }: { n: number; highlight?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold text-white flex-shrink-0',
        ballColor(n),
        highlight ? 'ring-2 ring-red-400 ring-offset-1 ring-offset-gray-800 scale-110' : 'opacity-90',
      ].join(' ')}
    >
      {n}
    </span>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-700/60 rounded-xl px-4 py-3 flex flex-col items-center gap-1 flex-1 min-w-[5rem]">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-gray-400 text-center leading-tight">{label}</span>
    </div>
  )
}

function DetailRow({ rec }: { rec: BacktestDetail }) {
  if (!rec.officialNumbers) {
    return (
      <div className="bg-gray-700/40 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-gray-500 text-xs font-mono w-20 flex-shrink-0">{rec.period}</span>
        <div className="flex flex-wrap gap-1 flex-1">
          {rec.myNumbers.map(n => <Ball key={n} n={n} />)}
        </div>
        <span className="text-xs text-gray-600 bg-gray-700 px-2 py-0.5 rounded flex-shrink-0">未比對</span>
      </div>
    )
  }

  const isWin = rec.isWin === true

  return (
    <div className={`rounded-lg px-3 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-2 border-l-2 ${
      isWin ? 'bg-emerald-900/20 border-emerald-500' : 'bg-red-900/20 border-red-500'
    }`}>
      <span className="text-gray-400 text-xs font-mono w-20 flex-shrink-0 pt-0.5">{rec.period}</span>

      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        <div className="flex flex-wrap gap-1">
          {rec.myNumbers.map(n => (
            <Ball key={n} n={n} highlight={rec.hits.includes(n)} />
          ))}
        </div>
        <span className="text-gray-500 text-xs">→</span>
        <div className="flex flex-wrap gap-1">
          {rec.officialNumbers.map(n => (
            <Ball key={n} n={n} highlight={rec.hits.includes(n)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          isWin
            ? 'bg-emerald-800/60 text-emerald-300'
            : 'bg-red-800/60 text-red-300'
        }`}>
          {isWin ? '✓ 過關' : '✕ 失敗'}
        </span>
        {rec.hits.length > 0 && (
          <span className="text-[10px] text-red-400">{rec.hits.length}中：{rec.hits.join(',')}</span>
        )}
      </div>
    </div>
  )
}

export default function BacktestPanel() {
  const [isOpen,  setIsOpen]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState<BacktestResponse | null>(null)

  const backtestVersion = useLotteryStore(s => s.backtestVersion)
  const gameMode        = useLotteryStore(s => s.gameMode)

  const fetchData = useCallback(async (game: string) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/backtest?game=${game}`)
      const json = await res.json() as BacktestResponse
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchData(gameMode)
  }, [isOpen, backtestVersion, gameMode, fetchData])

  // 遊戲切換時清除舊資料
  useEffect(() => {
    setData(null)
  }, [gameMode])

  const close = () => setIsOpen(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-2.5 bg-amber-700/80 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-colors tracking-wide"
      >
        查看五不中勝率分析
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />

          <div className="relative z-10 bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-white font-bold text-base">五不中 勝率回測</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  以期數對應官方開獎，0 中為過關
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchData(gameMode)}
                  disabled={loading}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  {loading ? '計算中…' : '重新計算'}
                </button>
                <button
                  onClick={close}
                  className="text-gray-500 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {loading && !data ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <span className="text-gray-500 text-sm">計算中…</span>
              </div>
            ) : !data ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <span className="text-gray-500 text-sm">載入失敗，請重試</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2 px-5 py-4 flex-shrink-0 border-b border-gray-700/50">
                  <StatCard label="總比對期數" value={data.total}    color="text-white" />
                  <StatCard label="過關期數"   value={data.wins}     color="text-emerald-400" />
                  <StatCard label="失敗期數"   value={data.losses}   color="text-red-400" />
                  <StatCard
                    label="五不中勝率"
                    value={data.total > 0 ? `${data.winRate}%` : '—'}
                    color={data.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
                  />
                </div>

                {data.unmatched > 0 && (
                  <p className="text-[10px] text-gray-600 px-5 pt-2 flex-shrink-0">
                    另有 {data.unmatched} 筆存檔未能比對（儲存日期無對應官方開獎）
                  </p>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {data.details.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">
                      尚無儲存紀錄 — 請先在下方「歷史存檔」區儲存選號
                    </p>
                  ) : (
                    data.details.map((rec, i) => (
                      <DetailRow key={`${rec.period}-${i}`} rec={rec} />
                    ))
                  )}
                </div>

                <div className="px-5 py-3 border-t border-gray-700/50 flex-shrink-0">
                  <p className="text-[10px] text-gray-600">
                    紅框 = 命中號碼（需命中 0 支才算過關）·
                    未比對筆數不計入勝率
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
