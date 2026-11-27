import type { CubeCoordinates } from 'honeycomb-grid'

import { getPlayerNumber, PIECE_COLORS } from './color-map'
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

export function randomizeStartingPositions(board: Board, random = Math.random): Board {
  const colors = [...PIECE_COLORS]
  for (let index = colors.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const color = colors[index]
    colors[index] = colors[other]
    colors[other] = color
  }
  return new Map(Array.from(board, ([key, cell]) => [
    key, cell.piece ? { ...cell, piece: { ...cell.piece, color: colors[getPlayerNumber(cell.piece.color) - 1] } } : cell,
  ]))
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
