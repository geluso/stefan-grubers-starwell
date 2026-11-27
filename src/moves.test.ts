import { expect, test } from 'bun:test'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import { canDoubleJump, checkedPlayersBy, createBoard, getKey, legalMoves, makeMove, previewDoubleJumps } from './moves'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from './pieces'

const grid = new Grid(defineHex(), spiral({ start: { q: 0, r: 0 }, radius: 5 }))
const hex = (q: number, r: number) => ({ q, r, s: -q - r })
const center = hex(0, 0)

test('an absolutely pinned piece can keep the line blocked or capture the attacker', () => {
  const king = hex(1, -2)
  const start = hex(2, -2)
  const attacker = hex(5, -2)
  const board = createBoard(grid, {
    [getKey(king)]: { text: KING, color: PIECE_WHITE },
    [getKey(start)]: { text: ROOK, color: PIECE_WHITE },
    [getKey(attacker)]: { text: ROOK, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start).map(getKey)).toEqual([hex(3, -2), hex(4, -2), attacker].map(getKey))
  expect(makeMove(board, start, hex(2, -1))).toBeNull()

  const next = makeMove(board, start, attacker)
  expect(next?.get(getKey(start))?.piece).toBeNull()
  expect(next?.get(getKey(attacker))?.piece?.color).toBe(PIECE_WHITE)
  expect(board.get(getKey(attacker))?.piece?.color).toBe(PIECE_PURPLE)
})

test('king safety checks threats from both opponents and rejects a capture on a defended hex', () => {
  const king = hex(1, -2)
  const start = hex(2, -2)
  const enemyKing = hex(0, -2)
  const board = createBoard(grid, {
    [getKey(king)]: { text: KING, color: PIECE_WHITE },
    [getKey(start)]: { text: ROOK, color: PIECE_WHITE },
    [getKey(hex(5, -2))]: { text: ROOK, color: PIECE_PURPLE },
    [getKey(hex(1, 2))]: { text: ROOK, color: PIECE_YELLOW },
    [getKey(enemyKing)]: { text: KING, color: PIECE_PURPLE },
    [getKey(hex(0, -3))]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start)).toEqual([])
  expect(legalMoves(board, king).map(getKey)).toEqual([getKey(hex(2, -3))])
  expect(makeMove(board, king, enemyKing)).toBeNull()
})

test('a pawn can move or capture one edge step in every direction', () => {
  const start = hex(0, 2)
  const friendly = hex(-1, 3)
  const enemy = hex(0, 1)
  const board = createBoard(grid, {
    [getKey(start)]: { text: PAWN, color: PIECE_WHITE },
    [getKey(friendly)]: { text: PAWN, color: PIECE_WHITE },
    [getKey(enemy)]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(legalMoves(board, start).map(getKey)).toEqual(
    [hex(1, 1), hex(1, 2), hex(0, 3), hex(-1, 2), enemy].map(getKey),
  )
})

test('a pawn can capture a king when the move keeps its own king safe', () => {
  const start = hex(2, -2)
  const target = hex(2, -1)
  const setup = {
    [getKey(hex(1, -2))]: { text: KING, color: PIECE_WHITE },
    [getKey(start)]: { text: PAWN, color: PIECE_WHITE },
    [getKey(target)]: { text: KING, color: PIECE_PURPLE },
  }
  const board = createBoard(grid, setup)

  expect(legalMoves(board, start).map(getKey)).toContain(getKey(target))
  const next = makeMove(board, start, target)
  expect(next?.get(getKey(start))?.piece).toBeNull()
  expect(next?.get(getKey(target))?.piece).toEqual({ text: PAWN, color: PIECE_WHITE })

  const pinned = createBoard(grid, {
    ...setup,
    [getKey(hex(5, -2))]: { text: ROOK, color: PIECE_YELLOW },
  })
  expect(makeMove(pinned, start, target)).toBeNull()
})

test('check notation identifies every opposing king attacked by the moving army', () => {
  const start = hex(0, -2)
  const end = hex(2, -2)
  const blackKing = hex(4, -2)
  const board = createBoard(grid, {
    [getKey(start)]: { text: ROOK, color: PIECE_YELLOW },
    [getKey(end)]: { text: PAWN, color: PIECE_PURPLE },
    [getKey(blackKing)]: { text: KING, color: PIECE_PURPLE },
    [getKey(hex(2, 0))]: { text: KING, color: PIECE_WHITE },
    [getKey(hex(4, -1))]: { text: ROOK, color: PIECE_WHITE },
  })

  expect(checkedPlayersBy(board, PIECE_YELLOW)).toEqual([])
  expect(checkedPlayersBy(board, PIECE_WHITE)).toEqual([2])

  const next = makeMove(board, start, end)
  expect(next).not.toBeNull()
  if (!next) return
  expect(checkedPlayersBy(next, PIECE_YELLOW)).toEqual([2, 3])

  const captured = makeMove(next, end, blackKing)
  expect(captured).not.toBeNull()
  if (!captured) return
  expect(checkedPlayersBy(captured, PIECE_YELLOW)).not.toContain(2)
})

test('the knight hops over edge neighbors, and the bishop stops at a piece on its corner ray', () => {
  const start = hex(0, 2)
  const firstCorner = hex(2, 1)
  const secondCorner = hex(4, 0)
  const setup = {
    [getKey(hex(1, 2))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(hex(1, 1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(firstCorner)]: { text: PAWN, color: PIECE_PURPLE },
  }

  const knight = createBoard(grid, { ...setup, [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE } })
  const knightMoves = legalMoves(knight, start).map(getKey)
  expect(new Set(knightMoves).size).toBe(6)
  expect(knightMoves).toContain(getKey(firstCorner))

  const bishop = createBoard(grid, { ...setup, [getKey(start)]: { text: BISHOP, color: PIECE_WHITE } })
  const bishopMoves = legalMoves(bishop, start).map(getKey)
  expect(bishopMoves).toContain(getKey(firstCorner))
  expect(bishopMoves).not.toContain(getKey(secondCorner))
})

test('a queen combines edge and corner rays', () => {
  const start = hex(0, 2)
  function movesFor(text: typeof ROOK | typeof BISHOP | typeof QUEEN) {
    return legalMoves(createBoard(grid, { [getKey(start)]: { text, color: PIECE_WHITE } }), start).map(getKey)
  }

  expect(movesFor(QUEEN)).toEqual([...movesFor(ROOK), ...movesFor(BISHOP)])
})

test('the center hole rejects landings and blocks sliding moves', () => {
  const near = hex(1, 0)
  const across = hex(-1, 0)
  const rookStart = hex(2, 0)
  const rookBoard = createBoard(grid, {
    [getKey(rookStart)]: { text: ROOK, color: PIECE_WHITE },
    [getKey(across)]: { text: ROOK, color: PIECE_PURPLE },
  })

  expect(legalMoves(rookBoard, rookStart).map(getKey)).toContain(getKey(near))
  expect(makeMove(rookBoard, rookStart, center)).toBeNull()
  expect(makeMove(rookBoard, rookStart, across)).toBeNull()

  const pawnBoard = createBoard(grid, { [getKey(near)]: { text: PAWN, color: PIECE_WHITE } })
  expect(pawnBoard.has(getKey(center))).toBe(false)
  expect(makeMove(pawnBoard, near, center)).toBeNull()
})

test('knights can hop over the center hole and capture on the far side', () => {
  const start = hex(1, 0)
  const landing = hex(-1, 1)
  const board = createBoard(grid, {
    [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE },
    [getKey(hex(0, 1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(landing)]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(makeMove(board, start, landing)?.get(getKey(landing))?.piece?.text).toBe(KNIGHT)
})

test('only knights starting on the outer ring can take a second jump', () => {
  const start = hex(0, 5)
  const first = hex(1, 3)
  const second = hex(2, 1)
  const board = createBoard(grid, {
    [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE },
  })

  expect(canDoubleJump(board, start)).toBe(true)
  expect(canDoubleJump(board, hex(-5, 5))).toBe(false)
  expect(legalMoves(board, start).map(getKey)).not.toContain(getKey(second))

  const afterFirst = makeMove(board, start, first, 'power')
  expect(afterFirst?.get(getKey(first))?.piece?.text).toBe(KNIGHT)
  expect(afterFirst && canDoubleJump(afterFirst, first)).toBe(false)
  const afterSecond = afterFirst && makeMove(afterFirst, first, second, 'power')
  expect(afterSecond?.get(getKey(first))?.piece).toBeNull()
  expect(afterSecond?.get(getKey(second))?.piece).toEqual({ text: KNIGHT, color: PIECE_WHITE })
})

test('a knight power cannot capture on either jump', () => {
  const start = hex(0, 5)
  const first = hex(1, 3)
  const second = hex(2, 1)
  const setup = { [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE } }
  const firstOccupied = createBoard(grid, {
    ...setup,
    [getKey(first)]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(previewDoubleJumps(firstOccupied, start).has(getKey(second))).toBe(false)
  expect(makeMove(firstOccupied, start, first, 'power')).toBeNull()
  expect(makeMove(firstOccupied, start, first)?.get(getKey(first))?.piece?.text).toBe(KNIGHT)

  const secondOccupied = createBoard(grid, {
    ...setup,
    [getKey(second)]: { text: PAWN, color: PIECE_YELLOW },
  })
  expect(previewDoubleJumps(secondOccupied, start).has(getKey(second))).toBe(false)
  const afterFirst = makeMove(secondOccupied, start, first, 'power')
  expect(afterFirst).not.toBeNull()
  if (!afterFirst) return
  expect(legalMoves(afterFirst, first, 'power').map(getKey)).not.toContain(getKey(second))
  expect(makeMove(afterFirst, first, second, 'power')).toBeNull()
})

test('selecting a knight on F1 previews both single jumps and second-jump destinations', () => {
  const edge = hex(0, 5)
  const knight = hex(-1, 4)
  const board = makeMove(createBoard(grid), knight, edge)
  expect(board).not.toBeNull()
  if (!board) return

  expect(legalMoves(board, edge).map(getKey).sort()).toEqual([getKey(knight), getKey(hex(1, 3))].sort())
  const routes = previewDoubleJumps(board, edge)
  expect([...routes.keys()].sort()).toEqual([hex(0, 2), hex(2, 1), hex(3, 2)].map(getKey).sort())
  const via = routes.get(getKey(hex(2, 1)))
  expect(via && getKey(via)).toBe(getKey(hex(1, 3)))
})

test('an enemy knight can threaten the king with a single jump but its power cannot give check', () => {
  const king = hex(2, 0)
  const threatened = hex(2, 1)
  const setup = {
    [getKey(king)]: { text: KING, color: PIECE_WHITE },
    [getKey(hex(0, 5))]: { text: KNIGHT, color: PIECE_PURPLE },
  }
  expect(makeMove(createBoard(grid, setup), king, threatened)).not.toBeNull()

  const kingNearWall = hex(1, 2)
  const nearBoard = createBoard(grid, {
    [getKey(kingNearWall)]: { text: KING, color: PIECE_WHITE },
    [getKey(hex(0, 5))]: { text: KNIGHT, color: PIECE_PURPLE },
  })
  expect(makeMove(nearBoard, kingNearWall, hex(1, 3))).toBeNull()
})
