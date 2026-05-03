import { create } from 'zustand'

const ALL = Array.from({ length: 39 }, (_, i) => i + 1)

function initMissing(): Record<number, number> {
  const m: Record<number, number> = {}
  ALL.forEach(n => { m[n] = 0 })
  return m
}

export interface TraceRecord {
  id: string
  group: number[]    // full candidates snapshot at confirm time
  selected: number
  time: number
}

export interface HistoryRecord {
  period: string
  numbers: number[]
  date: string
}

// 'select' = click → candidates  |  'exclude' = click → excluded
export type PoolMode = 'select' | 'exclude'

interface State {
  poolMode: PoolMode
  excluded: number[]
  candidates: number[]   // staging: pool → here → preview → locked
  preview: number[]
  locked: number[]       // only numbers confirmed via preview
  traces: TraceRecord[]
  missing: Record<number, number>
  period: string
  history: HistoryRecord[]
  backtestVersion: number   // incremented after save() or loadOfficialMissing() to trigger panel refresh
}

interface Actions {
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
  loadOfficialMissing(): Promise<void>
  bumpBacktest(): void
}

export const useLotteryStore = create<State & Actions>((set, get) => ({
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

  setPoolMode: (poolMode) => set({ poolMode }),

  toggleExclude: (n) =>
    set((s) => ({
      excluded: s.excluded.includes(n)
        ? s.excluded.filter(x => x !== n)
        : [...s.excluded, n],
    })),

  // Excluded and already-locked numbers cannot become candidates
  toggleCandidate: (n) =>
    set((s) => {
      if (s.excluded.includes(n) || s.locked.includes(n)) return s
      return {
        candidates: s.candidates.includes(n)
          ? s.candidates.filter(x => x !== n)
          : [...s.candidates, n].sort((a, b) => a - b),
      }
    }),

  clearCandidates: () => set({ candidates: [], preview: [] }),

  // Draw N numbers randomly from candidates (skip any that are already excluded/locked)
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

  // Confirm one number from preview:
  //   - add to locked
  //   - exclude the ENTIRE candidates group (auto-gray)
  //   - clear preview + candidates
  //   - record full trace
  confirmLock: (n) =>
    set((s) => {
      if (!s.preview.includes(n)) return s
      const newExcluded = Array.from(new Set([...s.excluded, ...s.candidates]))
      const newLocked   = [...s.locked, n].sort((a, b) => a - b)
      const trace: TraceRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        group: [...s.candidates],   // full candidate group, not just the drawn subset
        selected: n,
        time: Date.now(),
      }
      return {
        locked: newLocked,
        excluded: newExcluded,
        preview: [],
        candidates: [],
        traces: [trace, ...s.traces],
      }
    }),

  removeLocked: (n) =>
    set((s) => ({ locked: s.locked.filter(x => x !== n) })),

  deleteTrace: (id) =>
    set((s) => ({ traces: s.traces.filter(t => t.id !== id) })),

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
    const { period, locked } = get()
    if (!period.trim() || locked.length === 0) return
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, numbers: locked }),
    })
    await get().loadHistory()
    set(s => ({ backtestVersion: s.backtestVersion + 1 }))
  },

  loadHistory: async () => {
    try {
      const res  = await fetch('/api/history')
      const data = await res.json()
      set({ history: data.records ?? [] })
    } catch {}
  },

  // 從 official-draws.json 讀取真實遺漏值，取代初始化的 0
  loadOfficialMissing: async () => {
    try {
      const res = await fetch('/api/fetch-draws')
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
