import { expect, test } from 'bun:test'

import { chooseCpuTurn, randomizeStartingPositions } from './local-game'
import { getHexName } from './moves'
import { initialOnlineBoard, restoreOnlineBoard, serializeBoard } from './online-game'

test('random starts move whole armies between the three positions', () => {
  const initial = initialOnlineBoard()
  const shuffled = serializeBoard(randomizeStartingPositions(restoreOnlineBoard(initial), () => 0))
  const expected = Object.fromEntries(Object.entries(initial).map(([hex, piece]) =>
    [hex, piece[0] + (Number(piece[1]) % 3 + 1)]))
  expect(shuffled).toEqual(expected)
})

test('the CPU chooses a legal king capture and returns the resulting board', () => {
  const board = restoreOnlineBoard({ B1: 'r1', C1: 'k2', H6: 'k1', K9: 'k3' })
  const turn = chooseCpuTurn(board, 1)
  expect(turn).not.toBeNull()
  if (!turn) return
  expect(getHexName(turn.from.q, turn.from.r)).toBe('B1')
  expect(getHexName(turn.destination.q, turn.destination.r)).toBe('C1')
  expect(serializeBoard(turn.board)).toEqual({ C1: 'r1', H6: 'k1', K9: 'k3' })
  expect(chooseCpuTurn(turn.board, 2)).toBeNull()
})
