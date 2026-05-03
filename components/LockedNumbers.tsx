'use client'
import { useLotteryStore } from '@/store/useLotteryStore'

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

export default function LockedNumbers() {
  const locked      = useLotteryStore(s => s.locked)
  const removeLocked = useLotteryStore(s => s.removeLocked)
  const clearLocked  = useLotteryStore(s => s.clearLocked)
  const resetAll     = useLotteryStore(s => s.resetAll)

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-white font-bold text-base">
          鎖定名單
          <span className="ml-2 text-sm text-yellow-400 font-normal">{locked.length} 個</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={clearLocked}
            className="px-2 py-1 text-xs bg-orange-900 hover:bg-orange-800 text-orange-300 rounded transition-colors"
          >
            清除鎖定名單
          </button>
          <button
            onClick={resetAll}
            className="px-2 py-1 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors"
          >
            重置全部狀態
          </button>
        </div>
      </div>

      {locked.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">尚無鎖定號碼</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {locked.map(n => (
            <div key={n} className="relative">
              <div
                className={`w-10 h-10 rounded-full ${ballColor(n)} flex items-center justify-center text-white font-bold text-sm`}
              >
                {n}
              </div>
              <button
                onClick={() => removeLocked(n)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-900 border border-gray-600 hover:border-red-500 text-gray-400 hover:text-red-400 flex items-center justify-center text-[10px] transition-colors"
                title={`移除 ${n}（不影響主池排除狀態）`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
