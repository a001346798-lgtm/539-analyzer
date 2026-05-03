import { NextResponse } from 'next/server'

// Update these entries manually after each draw, or replace with a live-fetch proxy.
const DRAWS = [
  { period: '11500481', date: '2026-04-30', session: '晚', numbers: [3, 11, 22, 31, 37] },
  { period: '11500480', date: '2026-04-30', session: '早', numbers: [7, 14, 19, 28, 35] },
  { period: '11500479', date: '2026-04-29', session: '晚', numbers: [2, 16, 21, 33, 38] },
  { period: '11500478', date: '2026-04-29', session: '早', numbers: [5, 12, 24, 30, 36] },
  { period: '11500477', date: '2026-04-28', session: '晚', numbers: [8, 15, 20, 27, 39] },
  { period: '11500476', date: '2026-04-28', session: '早', numbers: [1, 13, 23, 32, 38] },
  { period: '11500475', date: '2026-04-27', session: '晚', numbers: [4, 17, 25, 34, 37] },
  { period: '11500474', date: '2026-04-27', session: '早', numbers: [6, 18, 26, 29, 35] },
]

export async function GET() {
  return NextResponse.json({ draws: DRAWS })
}
