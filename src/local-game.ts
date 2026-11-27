import type { CubeCoordinates } from 'honeycomb-grid'

import type { ViewPlayer } from './board-view'
import { getPlayerNumber } from './color-map'
import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
import { BOARD_RADIUS, canDoubleJump, getKey, legalMoveResults, type Board } from './moves'
import type { BoardPosition } from './online-game'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from './pieces'
import { playerAfterMove } from './turn-order'

export type LocalSeat = 'human' | 'cpu'
export type LocalSeats = [LocalSeat, LocalSeat, LocalSeat]
export type LocalGameState = {
  version: 1
  seats: LocalSeats
  perspective_player?: ViewPlayer
  initial_board: BoardPosition
  moves: { player: number; notation: string; board_after: BoardPosition }[]
  current_player: number
}

type CpuTurn = {
  from: CubeCoordinates
  via?: CubeCoordinates
  destination: CubeCoordinates
  board: Board
}

const material = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 20_000 }
const searchDepth = 3
const candidateLimit = 4

export function randomizeLocalSeats(seats: LocalSeats, random = Math.random) {
  const order = [0, 1, 2]
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const seat = order[index]
    order[index] = order[other]
    order[other] = seat
  }
  const human = seats.indexOf('human')
  return {
    seats: order.map(index => seats[index]) as LocalSeats,
    perspective: (human === -1 ? 1 : order.indexOf(human) + 1) as ViewPlayer,
  }
}

function evaluate(board: Board): number[] {
  const values = [0, 0, 0]
  for (const { position: { q, r, s }, piece } of board.values()) {
    if (!piece) continue
    const centrality = piece.text === KING ? 0 : BOARD_RADIUS - Math.max(Math.abs(q), Math.abs(r), Math.abs(s))
    values[getPlayerNumber(piece.color) - 1] += material[piece.text] + centrality
  }
  const total = values[0] + values[1] + values[2]
  return values.map(value => 3 * value - total)
}

function* turns(board: Board, player: number, rules: GameRules): Generator<CpuTurn> {
  for (const { position: from, piece } of board.values()) {
    if (!piece || getPlayerNumber(piece.color) !== player) continue
    const canJumpTwice = canDoubleJump(board, from)
    for (const first of legalMoveResults(board, from, 'normal', rules)) {
      yield { from, ...first }
      if (!canJumpTwice || board.get(getKey(first.destination))?.piece) continue
      for (const second of legalMoveResults(first.board, first.destination, 'power', rules)) {
        yield { from, via: first.destination, ...second }
      }
    }
  }
}

// MaxN lets each army maximize its own score when its turn comes up.
function search(board: Board, player: number, depth: number, rules: GameRules) {
  const candidates = Array.from(turns(board, player, rules), turn => ({ turn, scores: evaluate(turn.board) }))
    .sort((a, b) => b.scores[player - 1] - a.scores[player - 1])
    .slice(0, candidateLimit)
  let best: (typeof candidates)[number] | undefined
  for (const { turn, scores } of candidates) {
    const reply: number[] = depth > 1
      ? search(turn.board, playerAfterMove(player), depth - 1, rules)?.scores ?? scores
      : scores
    if (!best || reply[player - 1] > best.scores[player - 1]) best = { turn, scores: reply }
  }
  return best
}

export function chooseCpuTurn(board: Board, player: number, rules: GameRules = DEFAULT_GAME_RULES): CpuTurn | null {
  return search(board, player, searchDepth, rules)?.turn ?? null
}
