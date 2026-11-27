import { getPlayerNumber, PIECE_COLORS } from './color-map'

export function canMoveOnTurn(color: string, currentPlayer: number): boolean {
  return getPlayerNumber(color) === currentPlayer
}

export function playerAfterMove(player: number, secondJumpPending = false): number {
  return secondJumpPending ? player : player % PIECE_COLORS.length + 1
}
