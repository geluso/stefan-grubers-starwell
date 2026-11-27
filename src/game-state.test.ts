import { expect, test } from 'bun:test'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import { exportGameState } from './game-state'
import { BOARD_RADIUS, createBoard } from './moves'
import { KING, PAWN, QUEEN } from './pieces'

test('JSON and ASCII encode the same pieces in cube coordinates', () => {
  const grid = new Grid(defineHex(), spiral({ start: { q: 0, r: 0 }, radius: BOARD_RADIUS }))
  const board = createBoard(grid, {
    '(5, -5, 0)': { text: KING, color: PIECE_WHITE },
    '(-2, 4, -2)': { text: PAWN, color: PIECE_PURPLE },
    '(-2, 5, -3)': { text: QUEEN, color: PIECE_YELLOW },
  })
  const { json, ascii } = exportGameState(board)
  const lines = ascii.trimEnd().split('\n')
  const boardLines = lines.slice(1, -1)
  const rows = boardLines.map(line => line.slice(2, -2).trimEnd())

  expect(JSON.parse(json)).toEqual({
    version: 1,
    board: {
      '5,-5,0': 'k1',
      '-2,4,-2': 'p2',
      '-2,5,-3': 'q3',
    },
  })
  expect(lines[0]).toBe(`+=[STARWELL-ASCII-V1]${'='.repeat(24)}+`)
  expect(lines[12]).toBe(`+${'='.repeat(44)}+`)
  expect(boardLines.every(line => line.length === 46 && line.startsWith('| ') && line.endsWith(' |'))).toBe(true)
  expect(rows.map(row => row.trim().split(/\s+/).length)).toEqual([6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6])
  expect(rows[0]).toBe('          ..  ..  ..  ..  ..  k1')
  expect(rows[5]).toBe('..  ..  ..  ..  ..  ##  ..  ..  ..  ..  ..')
  expect(rows[9]).toBe('        ..  ..  ..  p2  ..  ..  ..')
  expect(rows[10]).toBe('          ..  ..  ..  q3  ..  ..')
})
