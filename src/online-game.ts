import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { getPlayerNumber, PIECE_COLORS } from './color-map.ts'
import type { GameRules } from './game-rules.ts'
import { BOARD_RADIUS, canDoubleJump, checkedPlayersBy, createBoard, getHexName, getKey, makeMove, type Board } from './moves.ts'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, type Piece } from './pieces.ts'

const piecesByLetter = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING } as const
const lettersByPiece = { [PAWN]: 'p', [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q', [KING]: 'k' }
const grid = new Grid(defineHex(), spiral({ start: { q: 0, r: 0 }, radius: BOARD_RADIUS }))
const positions = new Map(grid.toArray().filter(({ q, r }) => q !== 0 || r !== 0)
  .map(position => [getHexName(position.q, position.r), position]))

export type BoardPosition = Record<string, string>

export function initialOnlineBoard(): BoardPosition {
  return serializeBoard(createBoard(grid))
}

export function serializeBoard(board: Board): BoardPosition {
  const cells = Array.from(board.values()).filter(({ piece }) => piece !== null)
  cells.sort((a, b) => a.position.q - b.position.q || b.position.r - a.position.r)
  const result: BoardPosition = {}
  for (const { position, piece } of cells) {
    if (!piece) continue
    result[getHexName(position.q, position.r)] = lettersByPiece[piece.text] + getPlayerNumber(piece.color)
  }
  return result
}

export function restoreOnlineBoard(data: BoardPosition): Board {
  const pieces: Record<string, Piece> = {}
  for (const [name, code] of Object.entries(data)) {
    const position = positions.get(name)
    const text = typeof code === 'string' && piecesByLetter[code[0] as keyof typeof piecesByLetter]
    const color = typeof code === 'string' && PIECE_COLORS[Number(code[1]) - 1]
    if (!position || !text || !color || code.length !== 2) throw new Error('Invalid saved board.')
    pieces[getKey(position)] = { text, color }
  }
  return createBoard(grid, pieces)
}

export function playOnlineTurn(saved: BoardPosition, player: number, path: readonly string[], rules: GameRules) {
  if (path.length !== 2 && path.length !== 3) return null
  const start = positions.get(path[0])
  const first = positions.get(path[1])
  if (!start || !first) return null
  const board = restoreOnlineBoard(saved)
  const piece = board.get(getKey(start))?.piece
  if (!piece || getPlayerNumber(piece.color) !== player) return null

  const usesPower = path.length === 3
  if (usesPower && !canDoubleJump(board, start)) return null
  let next = makeMove(board, start, first, usesPower ? 'power' : 'normal', rules)
  if (!next) return null
  let notation = path[0] + (board.get(getKey(first))?.piece ? 'x' : '-') + path[1]
  if (usesPower) {
    const second = positions.get(path[2])
    if (!second) return null
    next = makeMove(next, first, second, 'power', rules)
    if (!next) return null
    notation += '-' + path[2]
  }
  const checks = checkedPlayersBy(next, piece.color, rules).map(target => `P${target}+`)
  return { board: serializeBoard(next), notation: [notation, ...checks].join(' ') }
}
