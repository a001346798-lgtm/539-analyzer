'use client'
import { useState } from 'react'
import { useLotteryStore } from '@/store/useLotteryStore'

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

export default function CandidateZone() {
  const [count, setCount]  = useState(5)
  const candidates         = useLotteryStore(s => s.candidates)
  const excluded           = useLotteryStore(s => s.excluded)
  const locked             = useLotteryStore(s => s.locked)
  const toggleCandidate    = useLotteryStore(s => s.toggleCandidate)
  const clearCandidates    = useLotteryStore(s => s.clearCandidates)
  const genPreview         = useLotteryStore(s => s.genPreview)

  // How many candidates are still drawable (not yet excluded/locked)
  const drawable = candidates.filter(
    n => !excluded.includes(n) && !locked.includes(n)
  ).length

  const canDraw = drawable > 0

  // Actual draw count (clamped to available)
  const actualDraw = Math.min(count, drawable)

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-violet-800/50">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-bold text-base">候選名單</h2>
          <span className={`text-xs font-medium ${candidates.length > 0 ? 'text-violet-400' : 'text-gray-500'}`}>
            {candidates.length} 個
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {candidates.length > 0 && (
            <button
              onClick={clearCandidates}
              className="text-xs text-orange-400 hover:text-white px-2 py-1 rounded bg-orange-900/30 border border-orange-700/50 transition-colors"
            >
              清空候選
            </button>
          )}

          {/* Count slider 1–10 */}
          <div className="flex items-center gap-1.5 bg-gray-700/60 rounded px-2 py-1">
            <span className="text-xs text-gray-400 select-none">抽取</span>
            <input
              type="range"
              min={1}
              max={10}
              value={count}
              onChange={e => setCount(Number(e.target.value))}
              className="w-20 h-1.5 accent-violet-500 cursor-pointer"
            />
            <span className="text-sm font-bold text-violet-300 w-5 text-center tabular-nums">
              {count}
            </span>
          </div>

          <button
            onClick={() => genPreview(count)}
            disabled={!canDraw}
            className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors"
          >
            亂數抽取
          </button>
        </div>
      </div>

      {/* Candidate balls */}
      {candidates.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-5">
          切換到「選候選」模式，在號碼池點選號碼加入候選
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            {candidates.map(n => {
              const faded = excluded.includes(n) || locked.includes(n)
              return (
                <button
                  key={n}
                  onClick={() => toggleCandidate(n)}
                  disabled={faded}
                  title={faded ? `${n} 已排除或鎖定` : `點擊移除候選 ${n}`}
                  className={[
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all',
                    faded
                      ? `${ballColor(n)} text-white opacity-25 cursor-not-allowed`
                      : `${ballColor(n)} text-white hover:ring-2 hover:ring-red-400 hover:ring-offset-1 hover:ring-offset-gray-800 hover:scale-105`,
                  ].join(' ')}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-500">
            可抽 {drawable} 個 · 本次抽 {actualDraw} 個 — 確認鎖定後整組候選自動反灰
          </p>
        </>
      )}
    </div>
  )
}
