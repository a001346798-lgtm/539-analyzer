'use client'
import { useEffect } from 'react'
import { useLotteryStore } from '@/store/useLotteryStore'

export default function HistoryPanel() {
  const period      = useLotteryStore(s => s.period)
  const locked      = useLotteryStore(s => s.locked)
  const history     = useLotteryStore(s => s.history)
  const setPeriod   = useLotteryStore(s => s.setPeriod)
  const save        = useLotteryStore(s => s.save)
  const loadHistory = useLotteryStore(s => s.loadHistory)

  useEffect(() => { loadHistory() }, [loadHistory])

  const canSave = period.trim().length > 0 && locked.length > 0

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h2 className="text-white font-bold text-base mb-3">歷史存檔</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="期數（例：11403001）"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="flex-1 min-w-0 bg-gray-700 text-white text-sm rounded px-3 py-2 border border-gray-600 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={save}
          disabled={!canSave}
          className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors flex-shrink-0"
        >
          儲存
        </button>
        <button
          onClick={loadHistory}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors flex-shrink-0"
        >
          重整
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-3">尚無存檔紀錄</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {[...history].reverse().map((rec, i) => (
            <div
              key={i}
              className="bg-gray-700/60 rounded px-3 py-2 flex items-center gap-3 text-sm"
            >
              <span className="text-gray-300 font-mono text-xs flex-shrink-0">{rec.period}</span>
              <span className="text-yellow-400 flex-1 truncate text-xs">
                [{rec.numbers.join(', ')}]
              </span>
              <span className="text-gray-500 text-xs flex-shrink-0">
                {new Date(rec.date).toLocaleDateString('zh-TW')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
