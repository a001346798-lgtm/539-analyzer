import { create } from 'zustand'

const ALL = Array.from({ length: 39 }, (_, i) => i + 1)

function initMissing(): Record<number, number> {
  const m: Record<number, number> = {}
  ALL.forEach(n => { m[n] = 0 })
  return m
}

export interface TraceRecord {
  id: string
  group: number[]
  selected: number
  time: number
}

export interface HistoryRecord {
  id:      number    // Supabase PK — 刪除時必須用這個，禁止用 period
  period:  string
  numbers: number[]
  date:    string
}

export type PoolMode = 'select' | 'exclude'
export type GameMode = 'tw539' | 'mi_fantasy5'

interface State {
  gameMode: GameMode
  poolMode: PoolMode
  excluded: number[]
  candidates: number[]
  preview: number[]
  locked: number[]
  traces: TraceRecord[]
  missing: Record<number, number>
  period: string
  history: HistoryRecord[]
  backtestVersion: number
}

interface Actions {
  setGameMode(m: GameMode): void
  setPoolMode(m: PoolMode): void
  toggleExclude(n: number): void
  toggleCandidate(n: number): void
  clearCandidates(): void
  genPreview(count: number): void
  confirmLock(n: number): void
  removeLocked(n: number): void
  deleteTrace(id: string): void
  clearLocked(): void
  resetAll(): void
  setPeriod(p: string): void
  save(): Promise<void>
  loadHistory(): Promise<void>
  deleteHistoryRecord(id: number): Promise<void>
  loadOfficialMissing(): Promise<void>
  bumpBacktest(): void
}

export const useLotteryStore = create<State & Actions>((set, get) => ({
  gameMode: 'tw539',
  poolMode: 'select',
  excluded: [],
  candidates: [],
  preview: [],
  locked: [],
  traces: [],
  missing: initMissing(),
  period: '',
  history: [],
  backtestVersion: 0,

  // 切換遊戲：重置所有選號狀態，但保留 history 由 loadHistory 重載
  setGameMode: (gameMode) => set({
    gameMode,
    poolMode: 'select',
    excluded: [],
    candidates: [],
    preview: [],
    locked: [],
    traces: [],
    missing: initMissing(),
    period: '',
  }),

  setPoolMode: (poolMode) => set({ poolMode }),

  toggleExclude: (n) =>
    set((s) => ({
      excluded: s.excluded.includes(n)
        ? s.excluded.filter(x => x !== n)
        : [...s.excluded, n],
    })),

  toggleCandidate: (n) =>
    set((s) => {
      if (s.excluded.includes(n) || s.locked.includes(n)) return s
      return {
        candidates: s.candidates.includes(n)
          ? s.candidates.filter(x => x !== n)
          : [...s.candidates, n].sort((a, b) => a - b),
      }
    }),

  // 有進行中的 preview → 放棄剩餘項目並將整組候選排除（批次終結）
  // 無 preview → 單純重置候選（重新選號，不排除）
  clearCandidates: () => set((s) => {
    if (s.preview.length > 0) {
      return {
        candidates: [],
        preview:    [],
        excluded:   Array.from(new Set([...s.excluded, ...s.candidates])),
      }
    }
    return { candidates: [], preview: [] }
  }),

  genPreview: (count) =>
    set((s) => {
      const pool = s.candidates.filter(
        n => !s.excluded.includes(n) && !s.locked.includes(n)
      )
      const shuffled = pool.slice().sort(() => Math.random() - 0.5)
      return {
        preview: shuffled.slice(0, Math.min(count, pool.length)).sort((a, b) => a - b),
      }
    }),

  // 允許多選：每次點擊只鎖定該號碼並將其從 preview 移除，
  // 其他 preview 號碼保持可點擊。
  // 當 preview 最後一個號碼被鎖定（preview 清空）→ 自動排除整組候選（批次終結）。
  confirmLock: (n) =>
    set((s) => {
      if (!s.preview.includes(n)) return s

      const newPreview = s.preview.filter(x => x !== n)
      const newLocked  = [...s.locked, n].sort((a, b) => a - b)
      const trace: TraceRecord = {
        id:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        group:    [...s.candidates],   // 拍照當前候選群，同批次多筆 trace 共用同一 group
        selected: n,
        time:     Date.now(),
      }

      // 最後一個 preview 號碼被鎖定 → 批次終結，排除整組候選
      if (newPreview.length === 0) {
        return {
          locked:     newLocked,
          excluded:   Array.from(new Set([...s.excluded, ...s.candidates])),
          preview:    [],
          candidates: [],
          traces:     [trace, ...s.traces],
        }
      }

      // 還有其他 preview 號碼 → 只移除已鎖定的，其餘保持可點擊
      return {
        locked:  newLocked,
        preview: newPreview,
        traces:  [trace, ...s.traces],
      }
    }),

  removeLocked: (n) =>
    set((s) => ({ locked: s.locked.filter(x => x !== n) })),

  // 刪除軌跡並同步還原主號池狀態：
  //   - 從 locked 移除 trace.selected（除非另一筆軌跡也選了同一號碼）
  //   - 從 excluded 移除 trace.group 的號碼（除非其他軌跡的 group 仍涵蓋該號碼）
  deleteTrace: (id) =>
    set((s) => {
      const trace = s.traces.find(t => t.id === id)
      if (!trace) return s

      const remaining      = s.traces.filter(t => t.id !== id)
      const groupsOfRemain = new Set(remaining.flatMap(t => t.group))
      const lockedByRemain = new Set(remaining.map(t => t.selected))

      return {
        traces:   remaining,
        locked:   s.locked.filter(
          x => x !== trace.selected || lockedByRemain.has(x)
        ),
        excluded: s.excluded.filter(
          x => !trace.group.includes(x) || groupsOfRemain.has(x)
        ),
      }
    }),

  clearLocked: () => set({ locked: [] }),

  resetAll: () =>
    set({
      poolMode: 'select',
      excluded: [],
      candidates: [],
      preview: [],
      locked: [],
      traces: [],
      missing: initMissing(),
      period: '',
    }),

  setPeriod: (period) => set({ period }),

  save: async () => {
    const { period, locked, gameMode } = get()
    if (!period.trim() || locked.length === 0) return
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, numbers: locked, game: gameMode }),
    })
    await get().loadHistory()
    set(s => ({ backtestVersion: s.backtestVersion + 1 }))
  },

  loadHistory: async () => {
    try {
      const { gameMode } = get()
      const res  = await fetch(`/api/history?game=${gameMode}`)
      const data = await res.json() as { records?: HistoryRecord[] }
      set({ history: data.records ?? [] })
    } catch {}
  },

  // 以 Supabase PK 精確刪除單筆，並同步更新 Zustand state
  deleteHistoryRecord: async (id: number) => {
    try {
      const res = await fetch('/api/history', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      if (!res.ok) return
      set(s => ({
        history:         s.history.filter(r => r.id !== id),
        backtestVersion: s.backtestVersion + 1,   // 刷新勝率面板
      }))
    } catch {}
  },

  loadOfficialMissing: async () => {
    try {
      const { gameMode } = get()
      const res = await fetch(`/api/fetch-draws?game=${gameMode}`)
      if (!res.ok) return
      const data = await res.json() as { missing?: Record<string, number> }
      if (!data.missing || Object.keys(data.missing).length === 0) return
      const missing: Record<number, number> = {}
      for (let n = 1; n <= 39; n++) {
        missing[n] = data.missing[String(n)] ?? 0
      }
      set(s => ({ missing, backtestVersion: s.backtestVersion + 1 }))
    } catch {}
  },

  bumpBacktest: () => set(s => ({ backtestVersion: s.backtestVersion + 1 })),
}))
