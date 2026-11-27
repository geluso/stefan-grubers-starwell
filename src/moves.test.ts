import { expect, test } from 'bun:test'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import type { GameRules } from './game-rules'
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

test('E2-H3 pins the green knight at J7 while the green rook at K7 can still move', () => {
  const afterRed = makeMove(createBoard(grid), hex(-1, 4), hex(2, 3))
  expect(afterRed).not.toBeNull()
  if (!afterRed) return
  const greenTurn = makeMove(afterRed, hex(-1, -1), hex(-1, 0))
  expect(greenTurn).not.toBeNull()
  if (!greenTurn) return

  const knight = hex(4, -1)
  const rook = hex(5, -1)
  const k6 = hex(5, 0)
  expect(greenTurn.get(getKey(knight))?.piece).toEqual({ text: KNIGHT, color: PIECE_WHITE })
  expect(legalMoves(greenTurn, knight)).toEqual([])
  expect(greenTurn.get(getKey(rook))?.piece).toEqual({ text: ROOK, color: PIECE_WHITE })
  expect(legalMoves(greenTurn, rook).map(getKey)).toContain(getKey(k6))
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

test('a knight jumps two straight steps and turns either way for twelve landings', () => {
  const start = hex(0, 1)
  const target = hex(3, 0)
  const board = createBoard(grid, {
    [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE },
    [getKey(hex(1, 1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(hex(2, 1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(target)]: { text: PAWN, color: PIECE_PURPLE },
  })

  const expected = [
    hex(2, -2), hex(3, -1), hex(3, 0), hex(2, 2), hex(1, 3), hex(-1, 4),
    hex(-2, 4), hex(-3, 3), hex(-3, 2), hex(-2, 0), hex(-1, -1), hex(1, -2),
  ]
  expect(legalMoves(board, start).map(getKey).sort()).toEqual(expected.map(getKey).sort())
  expect(makeMove(board, start, target)?.get(getKey(target))?.piece).toEqual({ text: KNIGHT, color: PIECE_WHITE })
})

test('the selected knight rule governs movement, check, and power previews', () => {
  const short: GameRules = { knightJump: 'short' }
  const start = hex(0, 1)
  const shortLanding = hex(2, 0)
  const longLanding = hex(3, 0)
  const board = createBoard(grid, {
    [getKey(start)]: { text: KNIGHT, color: PIECE_YELLOW },
    [getKey(shortLanding)]: { text: KING, color: PIECE_PURPLE },
    [getKey(longLanding)]: { text: KING, color: PIECE_WHITE },
  })
  expect(legalMoves(board, start, 'normal', short)).toHaveLength(6)
  expect(makeMove(board, start, shortLanding, 'normal', short)).not.toBeNull()
  expect(makeMove(board, start, longLanding, 'normal', short)).toBeNull()
  expect(checkedPlayersBy(board, PIECE_YELLOW, short)).toEqual([2])
  expect(checkedPlayersBy(board, PIECE_YELLOW)).toEqual([3])

  const edge = hex(0, 5)
  const wallBoard = createBoard(grid, { [getKey(edge)]: { text: KNIGHT, color: PIECE_YELLOW } })
  const via = previewDoubleJumps(wallBoard, edge, short).get(getKey(hex(2, 1)))
  expect(via && getKey(via)).toBe(getKey(hex(1, 3)))
})

test('the bishop stops at a piece on its corner ray', () => {
  const start = hex(0, 2)
  const firstCorner = hex(2, 1)
  const secondCorner = hex(4, 0)
  const setup = {
    [getKey(start)]: { text: BISHOP, color: PIECE_WHITE },
    [getKey(hex(1, 2))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(hex(1, 1))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(firstCorner)]: { text: PAWN, color: PIECE_PURPLE },
  }

  const bishop = createBoard(grid, setup)
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
  const landing = hex(-2, 1)
  const board = createBoard(grid, {
    [getKey(start)]: { text: KNIGHT, color: PIECE_WHITE },
    [getKey(hex(-1, 0))]: { text: PAWN, color: PIECE_WHITE },
    [getKey(landing)]: { text: PAWN, color: PIECE_PURPLE },
  })

  expect(makeMove(board, start, landing)?.get(getKey(landing))?.piece?.text).toBe(KNIGHT)
})

test('only knights starting on the outer ring can take a second jump', () => {
  const start = hex(0, 5)
  const first = hex(2, 2)
  const second = hex(4, -1)
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
  const first = hex(2, 2)
  const second = hex(4, -1)
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
  const board = createBoard(grid, { [getKey(edge)]: { text: KNIGHT, color: PIECE_YELLOW } })
  const singles = legalMoves(board, edge).map(getKey)
  expect(singles.sort()).toEqual([hex(2, 2), hex(-2, 4), hex(-1, 3), hex(1, 2)].map(getKey).sort())
  const routes = previewDoubleJumps(board, edge)
  const via = routes.get(getKey(hex(4, -1)))
  expect(via && getKey(via)).toBe(getKey(hex(2, 2)))
  expect(routes.has(getKey(edge))).toBe(false)
  expect(singles.some(key => routes.has(key))).toBe(false)
})

test('an enemy knight can threaten the king with a single jump but its power cannot give check', () => {
  const king = hex(4, 0)
  const threatened = hex(4, -1)
  const setup = {
    [getKey(king)]: { text: KING, color: PIECE_WHITE },
    [getKey(hex(0, 5))]: { text: KNIGHT, color: PIECE_PURPLE },
  }
  expect(makeMove(createBoard(grid, setup), king, threatened)).not.toBeNull()

  const kingNearWall = hex(2, 1)
  const nearBoard = createBoard(grid, {
    [getKey(kingNearWall)]: { text: KING, color: PIECE_WHITE },
    [getKey(hex(0, 5))]: { text: KNIGHT, color: PIECE_PURPLE },
  })
  expect(makeMove(nearBoard, kingNearWall, hex(2, 2))).toBeNull()
})
