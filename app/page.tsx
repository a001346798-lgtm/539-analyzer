import GameSwitcher  from '@/components/GameSwitcher'
import LatestDraw    from '@/components/LatestDraw'
import NumberPool       from '@/components/NumberPool'
import TailMissingPanel from '@/components/TailMissingPanel'
import CandidateZone    from '@/components/CandidateZone'
import PreviewArea   from '@/components/PreviewArea'
import LockedNumbers from '@/components/LockedNumbers'
import TraceHistory  from '@/components/TraceHistory'
import HistoryPanel  from '@/components/HistoryPanel'
import BacktestPanel from '@/components/BacktestPanel'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-12 space-y-4">
        <header className="text-center py-1">
          <h1 className="text-2xl font-bold text-white tracking-wide">539 分析工具</h1>
          <p className="text-xs text-gray-500 mt-1">亂數預覽 · 分組淘汰 · 軌跡追蹤</p>
        </header>
        <GameSwitcher />
        <LatestDraw />
        <NumberPool />
        <TailMissingPanel />
        <CandidateZone />
        <PreviewArea />
        <LockedNumbers />
        <TraceHistory />
        <HistoryPanel />
        <BacktestPanel />
      </div>
    </main>
  )
}
