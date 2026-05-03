'use client'
import { useLotteryStore, PoolMode } from '@/store/useLotteryStore'

const ALL = Array.from({ length: 39 }, (_, i) => i + 1)

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

export default function NumberPool() {
  const poolMode        = useLotteryStore(s => s.poolMode)
  const excluded        = useLotteryStore(s => s.excluded)
  const locked          = useLotteryStore(s => s.locked)
  const candidates      = useLotteryStore(s => s.candidates)
  const missing         = useLotteryStore(s => s.missing)
  const setPoolMode     = useLotteryStore(s => s.setPoolMode)
  const toggleExclude   = useLotteryStore(s => s.toggleExclude)
  const toggleCandidate     = useLotteryStore(s => s.toggleCandidate)
  const loadOfficialMissing = useLotteryStore(s => s.loadOfficialMissing)

  const available = ALL.length - excluded.length

  const handleClick = (n: number) => {
    if (poolMode === 'exclude') toggleExclude(n)
    else toggleCandidate(n)
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-bold text-base">主號碼池</h2>
          <span className="text-xs text-gray-400">可用 {available} 個</span>
          {candidates.length > 0 && (
            <span className="text-xs text-violet-400 font-medium">
              候選 {candidates.length} 個
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOfficialMissing}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700 transition-colors"
            title="從官方開獎資料重新載入遺漏值"
          >
            重載遺漏值
          </button>
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-sm">
            {(['select', 'exclude'] as PoolMode[]).map(m => (
              <button
                key={m}
                onClick={() => setPoolMode(m)}
                className={`px-3 py-1 font-medium transition-colors ${
                  poolMode === m
                    ? m === 'select'
                      ? 'bg-violet-600 text-white'
                      : 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {m === 'select' ? '選候選' : '排除'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-10 gap-1.5">
        {ALL.map(n => {
          // Priority: locked > excluded > candidate > normal
          const isLocked    = locked.includes(n)
          const isExcluded  = excluded.includes(n) && !isLocked
          const isCandidate = candidates.includes(n) && !isExcluded && !isLocked
          return (
            <button
              key={n}
              onClick={() => handleClick(n)}
              disabled={isLocked}
              className={[
                'flex flex-col items-center justify-center rounded-lg py-1.5 font-bold text-sm transition-all',
                isExcluded
                  ? 'bg-gray-700 text-gray-600 opacity-40 cursor-not-allowed'
                  : isLocked
                    ? `${ballColor(n)} text-white ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-800 opacity-60 cursor-default`
                    : isCandidate
                      ? `${ballColor(n)} text-white ring-2 ring-violet-400 ring-offset-1 ring-offset-gray-800 scale-105`
                      : `${ballColor(n)} text-white hover:brightness-110 hover:scale-105`,
              ].join(' ')}
              title={
                isLocked   ? `${n} — 已鎖定（確認中）` :
                isExcluded ? `${n} — 已排除` :
                isCandidate ? `${n} — 候選中（再次點擊移除）` :
                `${n} — 遺漏 ${missing[n] ?? 0} 期`
              }
            >
              <span className="leading-none">{n}</span>
              <span className="text-[10px] opacity-70 leading-none mt-0.5">{missing[n] ?? 0}</span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500 inline-block" />餘1
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-sky-500 inline-block" />餘2
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />餘0
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <span className="w-3 h-3 rounded ring-2 ring-violet-400 bg-red-500 inline-block" />候選中
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded ring-2 ring-yellow-400 bg-gray-600 inline-block" />已鎖定
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-700 opacity-40 inline-block" />已排除
        </span>
      </div>
    </div>
  )
}
