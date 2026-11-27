import type { CubeCoordinates } from 'honeycomb-grid'

import { PIECE_COLORS } from './color-map'
import { BISHOP, KING, KNIGHT, PAWN, PIECE_MAP, QUEEN, ROOK, type Piece } from './pieces'

type Cell = {
  readonly position: CubeCoordinates
  readonly piece: Piece | null
}

export type Board = ReadonlyMap<string, Cell>
export const BOARD_RADIUS = 5
type MoveMode = 'normal' | 'power'

// In order around a hex, so consecutive directions share a corner.
const EDGE_STEPS: readonly CubeCoordinates[] = [
  { q: 1, r: -1, s: 0 },
  { q: 1, r: 0, s: -1 },
  { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 },
  { q: -1, r: 0, s: 1 },
  { q: 0, r: -1, s: 1 },
]

function add(a: CubeCoordinates, b: CubeCoordinates): CubeCoordinates {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s }
}

// Left and right knight turns yield the same six offsets in a different order.
// Those offsets are also the steps along the bishop's corner-to-corner rays.
const CORNER_STEPS = EDGE_STEPS.map((step, index) =>
  add(step, EDGE_STEPS[(index + 1) % EDGE_STEPS.length]),
)

const MOVEMENT = {
  [PAWN]: { directions: EDGE_STEPS, limit: 1 },
  [KING]: { directions: EDGE_STEPS, limit: 1 },
  [KNIGHT]: { directions: CORNER_STEPS, limit: 1 },
  [ROOK]: { directions: EDGE_STEPS, limit: Infinity },
  [BISHOP]: { directions: CORNER_STEPS, limit: Infinity },
  [QUEEN]: { directions: [...EDGE_STEPS, ...CORNER_STEPS], limit: Infinity },
}

export function getKey({ q, r, s }: CubeCoordinates): string {
  return `(${q}, ${r}, ${s})`
}

export function getHexName(q: number, r: number): string {
  const column = 'ABCDEFGHIJK'[q + BOARD_RADIUS]
  const row = BOARD_RADIUS - r + 1
  return `${column}${row}`
}

export function canDoubleJump(board: Board, start: CubeCoordinates): boolean {
  const { q, r, s } = start
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === BOARD_RADIUS &&
    board.get(getKey(start))?.piece?.text === KNIGHT
}

export function createBoard(positions: Iterable<CubeCoordinates>, setup = PIECE_MAP): Board {
  const board = new Map<string, Cell>()
  for (const position of positions) {
    if (position.q === 0 && position.r === 0) continue
    const key = getKey(position)
    const piece = setup[key]
    board.set(key, { position, piece: piece?.text ? piece : null })
  }
  return board
}

function movementSquares(board: Board, start: CubeCoordinates, piece: Piece): CubeCoordinates[] {
  const { directions, limit } = MOVEMENT[piece.text]
  const squares: CubeCoordinates[] = []

  for (const direction of directions) {
    let position = start
    for (let step = 0; step < limit; step++) {
      position = add(position, direction)
      const cell = board.get(getKey(position))
      if (!cell || cell.piece?.color === piece.color) break

      squares.push(cell.position)
      if (cell.piece) break
    }
  }

  return squares
}

function boardAfterMove(board: Board, start: CubeCoordinates, end: CubeCoordinates, piece: Piece): Board {
  const next = new Map(board)
  next.set(getKey(start), { position: start, piece: null })
  next.set(getKey(end), { position: end, piece })
  return next
}

function isInCheck(board: Board, color: string, attacker?: string): boolean {
  const king = Array.from(board.values()).find(cell => cell.piece?.text === KING && cell.piece.color === color)
  if (!king) return false

  const kingKey = getKey(king.position)
  for (const { position, piece } of board.values()) {
    if (!piece || piece.color === color || (attacker !== undefined && piece.color !== attacker)) continue

    // Attacks use the piece's movement pattern without recursively checking its king.
    if (movementSquares(board, position, piece).some(square => getKey(square) === kingKey)) {
      return true
    }
  }
  return false
}

export function checkedPlayersBy(board: Board, attacker: string): number[] {
  return PIECE_COLORS.flatMap((color, index) =>
    color !== attacker && isInCheck(board, color, attacker) ? [index + 1] : [],
  )
}

export function legalMoves(board: Board, start: CubeCoordinates, mode: MoveMode = 'normal'): CubeCoordinates[] {
  const piece = board.get(getKey(start))?.piece
  if (!piece) return []

  return movementSquares(board, start, piece).filter(end => {
    if (mode === 'power' && board.get(getKey(end))?.piece) return false
    return !isInCheck(boardAfterMove(board, start, end, piece), piece.color)
  })
}

export function previewDoubleJumps(board: Board, start: CubeCoordinates): ReadonlyMap<string, CubeCoordinates> {
  const routes = new Map<string, CubeCoordinates>()
  const knight = board.get(getKey(start))?.piece
  if (!knight || !canDoubleJump(board, start)) return routes

  const firstLandings = legalMoves(board, start, 'power')
  // Keep the first landing selectable as a single jump when either route can reach it.
  const singleJumpKeys = new Set([getKey(start), ...firstLandings.map(getKey)])
  for (const first of firstLandings) {
    const afterFirst = boardAfterMove(board, start, first, knight)
    for (const second of legalMoves(afterFirst, first, 'power')) {
      const key = getKey(second)
      if (!singleJumpKeys.has(key) && !routes.has(key)) {
        routes.set(key, first)
      }
    }
  }
  return routes
}

export function makeMove(board: Board, start: CubeCoordinates, end: CubeCoordinates, mode: MoveMode = 'normal'): Board | null {
  const piece = board.get(getKey(start))?.piece
  if (!piece) return null

  const endKey = getKey(end)
  const destination = legalMoves(board, start, mode).find(square => getKey(square) === endKey)
  if (!destination) return null

  return boardAfterMove(board, start, destination, piece)
}
