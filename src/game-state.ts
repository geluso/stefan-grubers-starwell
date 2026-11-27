import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
import { BOARD_RADIUS, getHexName, type Board } from './moves'
import { serializeBoard } from './online-game'

export function exportGameState(board: Board, rules: GameRules = DEFAULT_GAME_RULES): { json: string; ascii: string } {
  const pieceAt = serializeBoard(board)
  const rows = []
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
    const tokens = []
    const firstColumn = Math.max(-BOARD_RADIUS, -r - BOARD_RADIUS)
    const lastColumn = Math.min(BOARD_RADIUS, -r + BOARD_RADIUS)
    for (let q = firstColumn; q <= lastColumn; q++) {
      tokens.push(q === 0 && r === 0 ? '##' : pieceAt[getHexName(q, r)] ?? '..')
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
    json: JSON.stringify({ version: 1, rules, board: pieceAt }, null, 2) + '\n',
    ascii: framedRows.join('\n') + '\n',
  }
}

export function exportMoves(rows: readonly (readonly (string | null)[])[], rules: GameRules = DEFAULT_GAME_RULES): string {
  const lines = rows.map(row => `    [${row.map(value => JSON.stringify(value)).join(', ')}]`)
  const moves = lines.length ? `[\n${lines.join(',\n')}\n  ]` : '[]'
  const rulesJson = JSON.stringify(rules, null, 2).replaceAll('\n', '\n  ')
  return `{\n  "version": 1,\n  "rules": ${rulesJson},\n  "moves": ${moves}\n}\n`
}
