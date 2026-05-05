'use client'
import { useMemo } from 'react'
import { useLotteryStore } from '@/store/useLotteryStore'

// ── 尾數分群（1-39，以個位數 n % 10 分類）─────────────────
// 0尾: 10, 20, 30        (3個)
// 1尾: 1, 11, 21, 31     (4個)
// 2尾: 2, 12, 22, 32     (4個)
// ... 其餘尾數各 4 個
const ALL_NUMS = Array.from({ length: 39 }, (_, i) => i + 1)

const TAIL_GROUPS: Record<number, number[]> = {}
for (let t = 0; t <= 9; t++) {
  TAIL_GROUPS[t] = ALL_NUMS.filter(n => n % 10 === t)
}

// 遺漏 ≥ 此值時顯示橘色警示
const WARN_AT = 4

export default function TailMissingPanel() {
  const missing = useLotteryStore(s => s.missing)

  // 尾數遺漏 = min(missing[n], for n in 該尾數組)
  // 原理：只要組內任一號碼出現過，那一期就不算遺漏；
  //       因此尾數最後出現距今的期數 = 組內各號碼遺漏值的最小值
  const tailData = useMemo(() =>
    Array.from({ length: 10 }, (_, t) => {
      const group = TAIL_GROUPS[t]
      const miss  = Math.min(...group.map(n => missing[n] ?? 0))
      return { tail: t, miss, group }
    }),
    [missing]
  )

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-base">尾數遺漏統計</h2>
        <span className="text-[10px] text-gray-500">
          遺漏 ≥ {WARN_AT} 期 <span className="text-orange-500">●</span> 橘色警示
        </span>
      </div>

      {/* 10-tail grid：手機 5 欄 × 2 列，桌機 10 欄 × 1 列 */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
        {tailData.map(({ tail, miss, group }) => {
          const isWarn = miss >= WARN_AT
          return (
            <div
              key={tail}
              className={[
                'flex flex-col items-center rounded-lg pt-2 pb-1.5 px-1 gap-0.5 transition-colors',
                isWarn
                  ? 'bg-orange-900/50 border border-orange-600/50'
                  : 'bg-gray-700/60 border border-transparent',
              ].join(' ')}
            >
              {/* 尾數標籤 */}
              <span className="text-gray-400 text-[10px] leading-none font-medium">
                {tail} 尾
              </span>

              {/* 遺漏期數（主要數字）*/}
              <span
                className={[
                  'text-2xl font-bold leading-tight tabular-nums',
                  isWarn ? 'text-orange-400' : 'text-white',
                ].join(' ')}
              >
                {miss}
              </span>

              {/* 組內號碼（微小字）*/}
              <span
                className={[
                  'text-[8px] leading-none text-center',
                  isWarn ? 'text-orange-700' : 'text-gray-600',
                ].join(' ')}
              >
                {group.join(' ')}
              </span>
            </div>
          )
        })}
      </div>

      {/* 說明文字 */}
      <p className="mt-2.5 text-[10px] text-gray-600">
        各尾數距今最後一次開出的期數 · 資料同步官方開獎紀錄 · 點「更新開獎資料」後即時刷新
      </p>
    </div>
  )
}
