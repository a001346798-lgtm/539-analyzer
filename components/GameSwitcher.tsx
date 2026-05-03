'use client'
import { useLotteryStore, GameMode } from '@/store/useLotteryStore'

const GAMES: { mode: GameMode; label: string; activeClass: string }[] = [
  { mode: 'tw539',       label: '今彩 539',    activeClass: 'bg-amber-600 text-white' },
  { mode: 'mi_fantasy5', label: '密西根天天樂', activeClass: 'bg-blue-600 text-white'  },
]

export default function GameSwitcher() {
  const gameMode            = useLotteryStore(s => s.gameMode)
  const setGameMode         = useLotteryStore(s => s.setGameMode)
  const loadOfficialMissing = useLotteryStore(s => s.loadOfficialMissing)
  const loadHistory         = useLotteryStore(s => s.loadHistory)

  const handleSwitch = (mode: GameMode) => {
    if (mode === gameMode) return
    setGameMode(mode)
    loadOfficialMissing()
    loadHistory()
  }

  return (
    <div className="flex rounded-xl overflow-hidden border border-gray-600">
      {GAMES.map(({ mode, label, activeClass }) => (
        <button
          key={mode}
          onClick={() => handleSwitch(mode)}
          className={`flex-1 py-2.5 text-sm font-semibold tracking-wide transition-colors ${
            gameMode === mode
              ? activeClass
              : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
