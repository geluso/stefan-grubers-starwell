import { PIECE_COLORS } from './color-map'
import { BOARD_RADIUS, type Board } from './moves'
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK } from './pieces'

const PIECE_LETTERS = {
  [PAWN]: 'p',
  [KNIGHT]: 'n',
  [BISHOP]: 'b',
  [ROOK]: 'r',
  [QUEEN]: 'q',
  [KING]: 'k',
}

export function exportGameState(board: Board): { json: string; ascii: string } {
  const pieces = []
  for (const { position: { q, r, s }, piece } of board.values()) {
    if (!piece) continue
    const player = PIECE_COLORS.indexOf(piece.color) + 1
    if (player === 0) throw new Error(`Unknown player color: ${piece.color}`)
    pieces.push({ piece: `${PIECE_LETTERS[piece.text]}${player}`, q, r, s })
  }

  pieces.sort((a, b) => a.r - b.r || a.q - b.q)
  const pieceAt = Object.fromEntries(pieces.map(({ q, r, s, piece }) => [`${q},${r},${s}`, piece]))
  const rows = []
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
    const tokens = []
    const firstColumn = Math.max(-BOARD_RADIUS, -r - BOARD_RADIUS)
    const lastColumn = Math.min(BOARD_RADIUS, -r + BOARD_RADIUS)
    for (let q = firstColumn; q <= lastColumn; q++) {
      const key = `${q},${r},${-q - r}`
      tokens.push(q === 0 && r === 0 ? '##' : pieceAt[key] ?? '..')
    }
    rows.push(' '.repeat(2 * Math.abs(r)) + tokens.join('  '))
  }

  const width = Math.max(...rows.map(row => row.length))
  const frameWidth = width + 2
  const framedRows = [
    `+${'=[STARWELL-ASCII-V1]'.padEnd(frameWidth, '=')}+`,
    ...rows.map((row, index) => {
      const side = index === BOARD_RADIUS ? 'X' : '|'
      return `${side} ${row.padEnd(width)} ${side}`
    }),
    `+${'='.repeat(frameWidth)}+`,
  ]

  return {
    json: JSON.stringify({ version: 1, board: pieceAt }, null, 2) + '\n',
    ascii: framedRows.join('\n') + '\n',
  }
}
