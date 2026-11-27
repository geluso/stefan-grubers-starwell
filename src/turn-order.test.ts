import { expect, test } from 'bun:test'

import { PIECE_PURPLE, PIECE_WHITE, PIECE_YELLOW } from './color-map'
import { canMoveOnTurn, playerAfterMove } from './turn-order'

test('completed moves cycle through Players 1, 2, and 3', () => {
  let player = 1
  for (const next of [2, 3, 1, 2, 3, 1]) {
    player = playerAfterMove(player)
    expect(player).toBe(next)
  }
})

test('turn enforcement accepts only the active army and can be switched off', () => {
  const armies = [PIECE_YELLOW, PIECE_PURPLE, PIECE_WHITE]
  for (const player of [1, 2, 3]) {
    expect(armies.filter(color => canMoveOnTurn(color, player, true))).toEqual([armies[player - 1]])
    expect(armies.every(color => canMoveOnTurn(color, player, false))).toBe(true)
  }
})

test('an optional second jump keeps the current turn until it is used or passed', () => {
  const player = playerAfterMove(3, true)
  expect(player).toBe(3)
  expect(canMoveOnTurn(PIECE_WHITE, player, true)).toBe(true)
  expect(canMoveOnTurn(PIECE_YELLOW, player, true)).toBe(false)
  expect(playerAfterMove(player)).toBe(1)
})
