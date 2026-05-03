'use client'
import { useLotteryStore } from '@/store/useLotteryStore'

function ballColor(n: number): string {
  if (n % 3 === 1) return 'bg-red-500'
  if (n % 3 === 2) return 'bg-sky-500'
  return 'bg-emerald-500'
}

export default function PreviewArea() {
  const preview     = useLotteryStore(s => s.preview)
  const confirmLock = useLotteryStore(s => s.confirmLock)

  if (preview.length === 0) return null

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-indigo-800/50">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-base">
          預覽區
          <span className="ml-2 text-sm text-indigo-400 font-normal">{preview.length} 個</span>
        </h2>
        <span className="text-xs text-gray-400">點擊號碼確認鎖定</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {preview.map(n => (
          <button
            key={n}
            onClick={() => confirmLock(n)}
            className={[
              'flex flex-col items-center justify-center w-12 h-14 rounded-xl font-bold',
              ballColor(n),
              'text-white hover:ring-2 hover:ring-yellow-400 hover:ring-offset-1 hover:ring-offset-gray-800 hover:scale-110 transition-all',
            ].join(' ')}
            title={`確認鎖定 ${n}`}
          >
            <span className="text-base leading-none">{n}</span>
            <span className="text-[9px] text-yellow-100 mt-1 leading-none">確認</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        點擊任一號碼確認鎖定 → 整組候選名單自動排除並記錄軌跡
      </p>
    </div>
  )
}
