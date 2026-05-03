'use client'
import { useLotteryStore } from '@/store/useLotteryStore'

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function TraceHistory() {
  const traces      = useLotteryStore(s => s.traces)
  const deleteTrace = useLotteryStore(s => s.deleteTrace)

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h2 className="text-white font-bold text-base mb-3">
        亂數軌跡
        <span className="ml-2 text-sm text-gray-400 font-normal">{traces.length} 組</span>
      </h2>

      {traces.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">尚無軌跡紀錄</p>
      ) : (
        <div className="space-y-2">
          {traces.map((rec, idx) => (
            <div
              key={rec.id}
              className="bg-gray-700/60 rounded-lg px-3 pt-2 pb-2.5"
            >
              {/* Row header: index · group size · time · delete */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs font-mono">
                    #{traces.length - idx}
                  </span>
                  <span className="text-gray-600 text-xs">
                    共 {rec.group.length} 個候選
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 hidden sm:inline">
                    {fmtTime(rec.time)}
                  </span>
                  <button
                    onClick={() => deleteTrace(rec.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs px-1"
                    title="刪除此筆軌跡"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* All group members; selected = highlighted */}
              <div className="flex flex-wrap gap-2">
                {rec.group.map(n => {
                  const isSelected = n === rec.selected
                  return (
                    <div key={n} className="flex flex-col items-center gap-0.5">
                      <span
                        className={[
                          'inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold transition-transform',
                          ballColor(n),
                          isSelected
                            ? 'text-white ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-700 scale-110 shadow-lg shadow-yellow-900/40'
                            : 'text-white opacity-35',
                        ].join(' ')}
                      >
                        {n}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] text-yellow-400 font-bold leading-none tracking-tight">
                          ✓ 選
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
