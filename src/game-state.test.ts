import { expect, test } from 'bun:test'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
import { exportGameState, exportMoves } from './game-state'
import hexCoordinates from './hex-coordinates.json'
import { BOARD_RADIUS, createBoard, getHexName } from './moves'
import { KING, PAWN, QUEEN } from './pieces'

const grid = new Grid(defineHex(), spiral({ start: { q: 0, r: 0 }, radius: BOARD_RADIUS }))

test('JSON and ASCII encode the same pieces at the named hexes', () => {
  const board = createBoard(grid, {
    '(5, -5, 0)': { text: KING, color: PIECE_WHITE },
    '(5, -4, -1)': { text: PAWN, color: PIECE_WHITE },
    '(5, -3, -2)': { text: QUEEN, color: PIECE_WHITE },
    '(-2, 4, -2)': { text: PAWN, color: PIECE_PURPLE },
    '(-2, 5, -3)': { text: QUEEN, color: PIECE_YELLOW },
  })
  const { json, ascii } = exportGameState(board)
  const lines = ascii.trimEnd().split('\n')
  const boardLines = lines.slice(1, -1)
  const rows = boardLines.map(line => line.slice(2, -2).trimEnd())

  const state = JSON.parse(json)
  expect(state).toEqual({
    version: 1,
    rules: DEFAULT_GAME_RULES,
    board: {
      D1: 'q1',
      D2: 'p2',
      K9: 'q3',
      K10: 'p3',
      K11: 'k3',
    },
  })
  expect(Object.keys(state.board)).toEqual(['D1', 'D2', 'K9', 'K10', 'K11'])
  expect(lines[0]).toBe(`+=[STARWELL-ASCII-V1]${'='.repeat(24)}+`)
  expect(lines[12]).toBe(`+${'='.repeat(44)}+`)
  expect(boardLines.every((line, index) => {
    const side = index === 5 ? 'X' : '|'
    return line.length === 46 && line.startsWith(`${side} `) && line.endsWith(` ${side}`)
  })).toBe(true)
  expect(rows.map(row => row.trim().split(/\s+/).length)).toEqual([6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6])
  expect(rows[0]).toBe('          ..  ..  ..  ..  ..  k3')
  expect(rows[5]).toBe('..  ..  ..  ..  ..  ##  ..  ..  ..  ..  ..')
  expect(rows[9]).toBe('        ..  ..  ..  p2  ..  ..  ..')
  expect(rows[10]).toBe('          ..  ..  ..  q1  ..  ..')
})

test('board and move JSON preserve the same selected rules', () => {
  const rules: GameRules = { knightJump: 'short' }
  const { json } = exportGameState(createBoard(grid), rules)
  const moves = [['E2-F1', null, null]]

  expect(JSON.parse(json).rules).toEqual(rules)
  expect(JSON.parse(exportMoves(moves, rules))).toEqual({ version: 1, rules, moves })
  expect(JSON.parse(exportMoves([], rules)).moves).toEqual([])
})

test('the static coordinate lookup matches every hex name including the center hole', () => {
  const lookup = Object.fromEntries(grid.toArray().map(({ q, r, s }) => [getHexName(q, r), `${q},${r},${s}`]))
  expect(hexCoordinates).toEqual(lookup)
  expect(hexCoordinates.A1).toBe('-5,5,0')
  expect(hexCoordinates.F6).toBe('0,0,0')
})
