import { expect, test } from 'bun:test'

import { rotateViewClockwise, rotationForPlayer, viewHexPosition, viewOffset, type BoardRotation } from './board-view'
import { chooseCpuTurn, randomizeLocalSeats, type LocalSeats } from './local-game'
import { getHexName } from './moves'
import { restoreOnlineBoard, serializeBoard } from './online-game'

test('random starts shuffle controllers and keep the local human in view', () => {
  const seats: LocalSeats = ['human', 'cpu', 'cpu']
  for (const [draws, player] of [[[0.9, 0.9], 1], [[0.9, 0], 2], [[0, 0], 3]] as const) {
    let draw = 0
    const shuffled = randomizeLocalSeats(seats, () => draws[draw++])
    expect(shuffled.perspective).toBe(player)
    expect(shuffled.seats.indexOf('human')).toBe(player - 1)
  }
  expect(seats).toEqual(['human', 'cpu', 'cpu'])
  expect(randomizeLocalSeats(['cpu', 'cpu', 'cpu'], () => 0).perspective).toBe(1)
})

test('each perspective rotates its own starting edge to the bottom', () => {
  expect(viewHexPosition({ q: -3, r: 5, s: -2 }, rotationForPlayer(1)).r).toBe(5)
  expect(viewHexPosition({ q: -2, r: -3, s: 5 }, rotationForPlayer(2)).r).toBe(5)
  expect(viewHexPosition({ q: 5, r: -2, s: -3 }, rotationForPlayer(3)).r).toBe(5)

  const x = Math.sqrt(3) / 2
  expect(viewOffset({ x, y: -1.5 }, rotationForPlayer(2)).y).toBeCloseTo(0)
  expect(viewOffset({ x, y: -1.5 }, rotationForPlayer(3)).y).toBeCloseTo(1.5)
})

test('each clockwise click moves the view by one sixth of a turn', () => {
  let rotation: BoardRotation = 0
  for (const step of [1, 2, 3, 4, 5, 0]) {
    rotation = rotateViewClockwise(rotation)
    expect(rotation).toBe(step)
    const viewHex = viewHexPosition({ q: 1, r: 1, s: -2 }, rotation)
    const offset = viewOffset({ x: 1.5 * Math.sqrt(3), y: 1.5 }, rotation)
    expect(offset.x).toBeCloseTo((viewHex.q + viewHex.r / 2) * Math.sqrt(3))
    expect(offset.y).toBeCloseTo(viewHex.r * 1.5)
  }
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
