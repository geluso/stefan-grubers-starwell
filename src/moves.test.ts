import { expect, test } from 'bun:test'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import { createBoard, getKey, legalMoves, makeMove } from './moves'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from './pieces'

const grid = new Grid(defineHex(), spiral({ start: { q: 0, r: 0 }, radius: 5 }))
const hex = (q: number, r: number) => ({ q, r, s: -q - r })
const center = hex(0, 0)

test('an absolutely pinned piece can keep the line blocked or capture the attacker', () => {
  const start = hex(1, 0)
  const attacker = hex(4, 0)
  const board = createBoard(grid, {
    [getKey(center)]: { text: KING, color: PIECE_WHITE },
    [getKey(start)]: { text: ROOK, color: PIECE_WHITE },
    [getKey(attacker)]: { text: ROOK, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start).map(getKey)).toEqual([hex(2, 0), hex(3, 0), attacker].map(getKey))
  expect(makeMove(board, start, hex(1, 1))).toBeNull()

  const next = makeMove(board, start, attacker)
  expect(next?.get(getKey(start))?.piece).toBeNull()
  expect(next?.get(getKey(attacker))?.piece?.color).toBe(PIECE_WHITE)
  expect(board.get(getKey(attacker))?.piece?.color).toBe(PIECE_PURPLE)
})

test('king safety checks threats from both opponents and rejects king captures', () => {
  const start = hex(1, 0)
  const enemyKing = hex(-1, 0)
  const board = createBoard(grid, {
    [getKey(center)]: { text: KING, color: PIECE_WHITE },
    [getKey(start)]: { text: ROOK, color: PIECE_WHITE },
    [getKey(hex(4, 0))]: { text: ROOK, color: PIECE_PURPLE },
    [getKey(hex(0, 4))]: { text: ROOK, color: PIECE_YELLOW },
    [getKey(enemyKing)]: { text: KING, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start)).toEqual([])
  expect(legalMoves(board, center).map(getKey)).toEqual([getKey(hex(1, -1))])
  expect(makeMove(board, center, enemyKing)).toBeNull()
})

test('a pawn can move or capture one edge step in every direction', () => {
  const start = hex(0, 0)
  const friendly = hex(-1, 1)
  const enemy = hex(0, -1)
  const board = createBoard(grid, {
    [getKey(start)]: { text: PAWN, color: PIECE_WHITE },
    [getKey(friendly)]: { text: PAWN, color: PIECE_WHITE },
    [getKey(enemy)]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start).map(getKey)).toEqual(
    [hex(1, -1), hex(1, 0), hex(0, 1), hex(-1, 0), enemy].map(getKey),
  )
})

test('the knight hops over edge neighbors, and the bishop stops at a piece on its corner ray', () => {
  const firstCorner = hex(2, -1)
  const secondCorner = hex(4, -2)
  const setup = {
    [getKey(hex(1, 0))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(hex(1, -1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(firstCorner)]: { text: PAWN, color: PIECE_PURPLE },
  }

  const knight = createBoard(grid, { ...setup, [getKey(center)]: { text: KNIGHT, color: PIECE_WHITE } })
  const knightMoves = legalMoves(knight, center).map(getKey)
  expect(new Set(knightMoves).size).toBe(6)
  expect(knightMoves).toContain(getKey(firstCorner))

  const bishop = createBoard(grid, { ...setup, [getKey(center)]: { text: BISHOP, color: PIECE_WHITE } })
  const bishopMoves = legalMoves(bishop, center).map(getKey)
  expect(bishopMoves).toContain(getKey(firstCorner))
  expect(bishopMoves).not.toContain(getKey(secondCorner))
})

test('a queen combines edge and corner rays', () => {
  function movesFor(text: typeof ROOK | typeof BISHOP | typeof QUEEN) {
    return legalMoves(createBoard(grid, { [getKey(center)]: { text, color: PIECE_WHITE } }), center).map(getKey)
  }

  expect(movesFor(QUEEN)).toEqual([...movesFor(ROOK), ...movesFor(BISHOP)])
})
