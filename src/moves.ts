import type { CubeCoordinates } from 'honeycomb-grid'

import { BISHOP, KING, KNIGHT, PAWN, PIECE_MAP, QUEEN, ROOK, type Piece } from './pieces'

type Cell = {
  readonly position: CubeCoordinates
  readonly piece: Piece | null
}

export type Board = ReadonlyMap<string, Cell>
export const BOARD_RADIUS = 5

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

function isInCheck(board: Board, color: string): boolean {
  const king = Array.from(board.values()).find(cell => cell.piece?.text === KING && cell.piece.color === color)
  if (!king) return false

  const kingKey = getKey(king.position)
  for (const { position, piece } of board.values()) {
    if (!piece || piece.color === color) continue

    // Attacks use the piece's movement pattern without recursively checking its king.
    if (movementSquares(board, position, piece).some(square => getKey(square) === kingKey)) {
      return true
    }
  }
  return false
}

export function legalMoves(board: Board, start: CubeCoordinates): CubeCoordinates[] {
  const piece = board.get(getKey(start))?.piece
  if (!piece) return []

  return movementSquares(board, start, piece).filter(end =>
    !isInCheck(boardAfterMove(board, start, end, piece), piece.color),
  )
}

export function makeMove(board: Board, start: CubeCoordinates, end: CubeCoordinates): Board | null {
  const piece = board.get(getKey(start))?.piece
  if (!piece) return null

  const endKey = getKey(end)
  const destination = legalMoves(board, start).find(square => getKey(square) === endKey)
  if (!destination) return null

  return boardAfterMove(board, start, destination, piece)
}
