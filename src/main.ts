import { SVG } from '@svgdotjs/svg.js'
import { defineHex, Grid, spiral, type CubeCoordinates, type Point } from 'honeycomb-grid'

import { bindBoardPointer } from './board-pointer'
import { COLOR_MAP, getPlayerNumber, PIECE_COLORS } from './color-map'
import { DEFAULT_GAME_RULES, type GameRules } from './game-rules'
import { exportGameState, exportMoves } from './game-state'
import { BOARD_RADIUS, canDoubleJump, checkedPlayersBy, createBoard, getHexName, getKey, legalMoves, makeMove, previewDoubleJumps, type Board } from './moves'
import { bindOnlinePlay, type OnlineGame } from './online'
import { restoreOnlineBoard } from './online-game'
import type { Piece } from './pieces'
import { loadPreferences, savePreference } from './preferences'
import { canMoveOnTurn, playerAfterMove } from './turn-order'

// you may want the origin to be the top left corner of a hex's bounding box
// instead of its center (which is the default)
const Hex = defineHex({ dimensions: 30, origin: 'topLeft' })
const center = { q: 0, r: 0 }
const grid = new Grid(Hex, spiral({ start: center, radius: BOARD_RADIUS }))
let gameRules: GameRules = DEFAULT_GAME_RULES
let board = createBoard(grid)
const history: { board: Board; cell: HTMLTableCellElement | null }[] = [{ board, cell: null }]
let viewedTurn = 0
let selected: CubeCoordinates | null = null
let secondKnightJump = false
let doubleJumpRoutes: ReadonlyMap<string, CubeCoordinates> = new Map()
let currentPlayer = 1
const preferences = loadPreferences()
let onlineGame: OnlineGame | null = null
let onlineSaving = false
let pendingOnlinePath: string[] | null = null
let localGame: {
  history: typeof history
  rows: HTMLTableRowElement[]
  viewedTurn: number
  currentPlayer: number
  lastMoveCell: HTMLTableCellElement | null
  lastMovePath: string
  lastMovePlayer: number
  selected: CubeCoordinates | null
  secondKnightJump: boolean
} | null = null

const draw = SVG().addTo('#board-stage').addClass('starwell-board').size('100%', '100%')
const pieceFont = { size: 48, family: 'sans-serif' }
const edgeLabelFont = { size: 8, family: 'sans-serif', weight: 600 }
const edgeLabelColor = '#e4e4e4'
const edgeLabelOffset = 8
const pieceMetrics = document.createElement('canvas').getContext('2d')

if (pieceMetrics) {
  pieceMetrics.font = `${pieceFont.size}px ${pieceFont.family}`
  pieceMetrics.textAlign = 'left'
  pieceMetrics.textBaseline = 'alphabetic'
}

const corners = grid.toArray().flatMap(hex => hex.corners)
const xs = corners.map(point => point.x)
const ys = corners.map(point => point.y)
const left = Math.min(...xs)
const top = Math.min(...ys)
const padding = 2
const rowLabelGutter = 24
const columnLabelGutter = 16

draw.viewbox(
  left - padding - rowLabelGutter,
  top - padding - columnLabelGutter,
  Math.max(...xs) - left + (padding + rowLabelGutter) * 2,
  Math.max(...ys) - top + (padding + columnLabelGutter) * 2,
)

function pointBetween(start: Point, end: Point, fraction: number): Point {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  }
}

function captureMarkerPath(corners: Point[], center: Point): string {
  const inset = corners.map(corner => pointBetween(center, corner, 0.84))
  return inset.map((corner, index) => {
    const previous = inset[(index + inset.length - 1) % inset.length]
    const next = inset[(index + 1) % inset.length]
    const start = pointBetween(corner, previous, 0.2)
    const end = pointBetween(corner, next, 0.2)
    return `M ${start.x} ${start.y} L ${corner.x} ${corner.y} L ${end.x} ${end.y}`
  }).join(' ')
}

const renderSVG = (hex: InstanceType<typeof Hex>) => {
  const key = getKey(hex)
  const color = COLOR_MAP[key as keyof typeof COLOR_MAP]
  const hexCorners = hex.corners
  const tile = draw.group()
  const playable = board.has(key)
  const name = getHexName(hex.q, hex.r)

  const polygon = tile
    .polygon(hexCorners.map(({ x, y }) => `${x},${y}`))
    .addClass('hex-tile')
    .fill(color)

  if (playable) polygon.attr('data-hex-key', key)

  const x = polygon.cx()
  const y = polygon.cy()

  if (hex.q === -BOARD_RADIUS || hex.s === BOARD_RADIUS) {
    const leftEdge = Math.min(...hexCorners.map(corner => corner.x))
    tile.plain(name.slice(1))
      .addClass('hex-row-number')
      .font(edgeLabelFont)
      .fill(edgeLabelColor)
      .center(leftEdge - edgeLabelOffset, y)
      .attr({ 'pointer-events': 'none', 'aria-hidden': 'true' })
  }

  if (hex.r === BOARD_RADIUS || hex.s === -BOARD_RADIUS) {
    const [, lowerRight, bottom] = hexCorners
    const midpoint = pointBetween(lowerRight, bottom, 0.5)
    const distance = Math.hypot(midpoint.x - x, midpoint.y - y)
    const label = pointBetween({ x, y }, midpoint, 1 + edgeLabelOffset / distance)
    tile.plain(name[0])
      .addClass('hex-column-letter')
      .font(edgeLabelFont)
      .fill(edgeLabelColor)
      .center(label.x, label.y)
      .attr({ 'pointer-events': 'none', 'aria-hidden': 'true' })
  }

  const pieceLabel = tile.plain('')
    .addClass('hex-piece')
    .font(pieceFont)
    .attr('pointer-events', 'none')

  tile.circle(11)
    .addClass('hex-move-dot')
    .fill('#222')
    .center(x, y)
    .attr('pointer-events', 'none')

  const starPoints = Array.from({ length: 10 }, (_, index) => {
    const angle = index * Math.PI / 5 - Math.PI / 2
    const radius = index % 2 === 0 ? 10 : 4
    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`
  })
  tile.polygon(starPoints)
    .addClass('hex-jump-star')
    .fill('black')
    .attr({ 'pointer-events': 'none', 'aria-hidden': 'true' })

  tile.path(captureMarkerPath(hexCorners, { x, y }))
    .addClass('hex-capture-marker')
    .fill('none')
    .stroke({ color: 'black', width: 2, linecap: 'round', linejoin: 'round' })
    .attr('pointer-events', 'none')

  tile.plain(playable ? name : '★')
    .addClass(playable ? 'hex-coordinates' : 'hex-center-star')
    .font({ size: playable ? 10 : 28, family: 'sans-serif' })
    .fill(playable ? 'black' : '#ffe34c')
    .center(x, y)
    .attr('pointer-events', 'none')

  function renderPiece(piece: Piece | null) {
    pieceLabel.plain(piece?.text ?? '')
    if (piece) {
      pieceLabel.fill(piece.color).attr('data-army', piece.color)
      const bounds = pieceMetrics?.measureText(piece.text)
      if (bounds) {
        // SVG text uses a baseline. Offset it by the center of the visible glyph.
        pieceLabel.attr({
          x: x + (bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) / 2,
          y: y + (bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2,
        })
      } else {
        pieceLabel.center(x, y)
      }
    }
  }

  renderPiece(board.get(key)?.piece ?? null)
  return { renderPiece, pieceLabel, tile }
}

const tiles = new Map(grid.toArray().map(hex => [getKey(hex), renderSVG(hex)]))

const moveHistoryRows = document.querySelector<HTMLTableSectionElement>('#move-history-rows')
const moveHistoryList = document.querySelector<HTMLElement>('.move-history-list')
const historyPosition = document.querySelector<HTMLElement>('#history-position')
const playerHeaders = document.querySelectorAll('.move-history th')
let lastMovePlayer = 0
let lastMoveCell: HTMLTableCellElement | null = null
let lastMovePath = ''
const finishOnline = document.querySelector<HTMLButtonElement>('#online-finish')!

function reviewingHistory(): boolean {
  return viewedTurn < history.length - 1
}

function updateHistoryPosition() {
  if (!historyPosition) return
  const latest = history.length - 1
  historyPosition.hidden = latest === 0
  historyPosition.textContent = latest === 0 ? '' :
    reviewingHistory() ? `Reviewing turn ${viewedTurn} of ${latest}` : `Turn ${latest} of ${latest} · Live`
}

function updateTurnIndicator() {
  playerHeaders.forEach((header, index) => {
    if (!reviewingHistory() && onlineGame?.status !== 'waiting' && index + 1 === currentPlayer) {
      header.setAttribute('aria-current', 'true')
    } else {
      header.removeAttribute('aria-current')
    }
  })
}

function isPlayerTurn(piece: Piece): boolean {
  if (onlineGame) {
    return !onlineSaving && onlineGame.status === 'active' && onlineGame.seat === onlineGame.current_player &&
      canMoveOnTurn(piece.color, onlineGame.seat)
  }
  return canMoveOnTurn(piece.color, currentPlayer)
}

function updateTurnAfterMove(player: number, secondJumpPending = false) {
  currentPlayer = playerAfterMove(player, secondJumpPending)
  updateTurnIndicator()
}

updateTurnIndicator()

function moveLeg(position: CubeCoordinates, beforeMove: Board): string {
  const capture = beforeMove.get(getKey(position))?.piece
  return `${capture ? 'x' : '-'}${getHexName(position.q, position.r)}`
}

function addMoveCell(player: number) {
  if (!moveHistoryRows) return null
  let row = moveHistoryRows.rows[moveHistoryRows.rows.length - 1]
  if (!row || player <= lastMovePlayer) {
    row = moveHistoryRows.insertRow()
    for (const _ of PIECE_COLORS) row.insertCell()
  }
  lastMovePlayer = player
  return row.cells[player - 1]
}

function recordMove(piece: Piece, start: CubeCoordinates, route: string, result: Board, continuing: boolean) {
  if (continuing && lastMoveCell) {
    lastMovePath += route
  } else {
    lastMoveCell = addMoveCell(getPlayerNumber(piece.color))
    lastMovePath = getHexName(start.q, start.r) + route
  }

  const checks = checkedPlayersBy(result, piece.color, gameRules).map(player => `P${player}+`)
  if (lastMoveCell) lastMoveCell.textContent = [lastMovePath, ...checks].join(' ')
  if (moveHistoryList) moveHistoryList.scrollTop = moveHistoryList.scrollHeight
  return lastMoveCell
}

function exportMoveHistory(): string {
  const rows = new Map<HTMLElement, (string | null)[]>()
  for (const { cell } of history.slice(1, viewedTurn + 1)) {
    const sourceRow = cell?.parentElement
    if (!cell || !sourceRow) continue
    let row = rows.get(sourceRow)
    if (!row) {
      row = PIECE_COLORS.map(() => null)
      rows.set(sourceRow, row)
    }
    row[cell.cellIndex] = cell.textContent
  }

  return exportMoves([...rows.values()], gameRules)
}

function downloadGameState(content: string, filename: string, type: string) {
  const file = new Blob([content], { type })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const exportDialog = document.querySelector<HTMLDialogElement>('#game-state-dialog')
const jsonPreview = document.querySelector<HTMLTextAreaElement>('#game-state-json')
const asciiPreview = document.querySelector<HTMLTextAreaElement>('#game-state-ascii')
const movesPreview = document.querySelector<HTMLTextAreaElement>('#game-state-moves')
const exportStatus = document.querySelector('#export-status')

if (exportDialog && jsonPreview && asciiPreview && movesPreview && exportStatus) {
  const formats = ([
    { key: 'json', name: 'JSON', preview: jsonPreview, filename: 'starwell-game-state.json', type: 'application/json' },
    { key: 'ascii', name: 'ASCII', preview: asciiPreview, filename: 'starwell-game-state.txt', type: 'text/plain' },
    { key: 'moves', name: 'Moves', preview: movesPreview, filename: 'starwell-moves.json', type: 'application/json' },
  ] as const).map(format => {
    const section = format.preview.closest('.export-format')
    const lineNumbers = section?.querySelector<HTMLPreElement>('.export-line-gutter pre')
    return { ...format, section, lineNumbers }
  })

  document.querySelector('#export-game-state')?.addEventListener('click', () => {
    const snapshot = { ...exportGameState(history[viewedTurn].board, gameRules), moves: exportMoveHistory() }
    for (const { key, preview, lineNumbers } of formats) {
      preview.value = snapshot[key]
      if (lineNumbers) {
        const lineCount = preview.value.trimEnd().split('\n').length
        lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')
        lineNumbers.style.transform = ''
      }
    }
    exportStatus.textContent = ''
    exportDialog.showModal()
    for (const { preview } of formats) {
      preview.scrollTop = preview.scrollLeft = 0
    }
  })

  const isBackdrop = (event: MouseEvent) => {
    if (event.target !== exportDialog) return false
    const { left, right, top, bottom } = exportDialog.getBoundingClientRect()
    return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom
  }

  let pressedBackdrop = false
  exportDialog.addEventListener('pointerdown', event => {
    pressedBackdrop = isBackdrop(event)
  })
  exportDialog.addEventListener('click', event => {
    if (pressedBackdrop && isBackdrop(event)) exportDialog.close()
    pressedBackdrop = false
  })

  for (const { name, preview, filename, type, section, lineNumbers } of formats) {
    if (lineNumbers) {
      preview.addEventListener('scroll', () => {
        lineNumbers.style.transform = `translateY(${-preview.scrollTop}px)`
      })
    }
    section?.querySelector('.export-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(preview.value)
        exportStatus.textContent = `Copied ${name} to the clipboard.`
      } catch {
        preview.select()
        exportStatus.textContent = `Clipboard unavailable. ${name} is selected for manual copying.`
      }
    })
    section?.querySelector('.export-download')?.addEventListener('click', () => {
      downloadGameState(preview.value, filename, type)
    })
  }
}

for (const row of document.querySelectorAll<HTMLElement>('[data-palette-for]')) {
  const paletteFor = row.dataset.paletteFor
  if (paletteFor !== 'pieces' && paletteFor !== 'hexes') continue
  const paletteAttribute = `data-${paletteFor}-palette`
  const target = paletteFor === 'hexes' ? draw.node : document.documentElement
  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button[data-palette]'))

  function applyPalette(button: HTMLButtonElement) {
    target.setAttribute(paletteAttribute, button.dataset.palette ?? '')
    for (const option of buttons) {
      option.setAttribute('aria-pressed', String(option === button))
    }
  }

  const initial = buttons.find(button => button.dataset.palette === preferences[paletteFor]) ??
    buttons.find(button => button.getAttribute('aria-pressed') === 'true')
  if (initial) applyPalette(initial)

  for (const button of buttons) {
    button.addEventListener('click', () => {
      if (!button.dataset.palette) return
      applyPalette(button)
      savePreference(paletteFor, button.dataset.palette)
    })
  }
}

function select(position: CubeCoordinates | null, continuingJump = false) {
  const destinations = new Set(position ? legalMoves(board, position, continuingJump ? 'power' : 'normal', gameRules).map(getKey) : [])
  selected = continuingJump && !destinations.size ? null : position
  secondKnightJump = continuingJump && selected !== null
  const outerKnight = selected && !secondKnightJump && canDoubleJump(board, selected)
  doubleJumpRoutes = selected && outerKnight ? previewDoubleJumps(board, selected, gameRules) : new Map()
  for (const [key, { tile }] of tiles) {
    const doubleJump = doubleJumpRoutes.has(key)
    if (!reviewingHistory() && (destinations.has(key) || doubleJump)) {
      const capture = board.get(key)?.piece
      const jump = secondKnightJump || doubleJump ? 'second' : outerKnight && !capture ? 'first' : null
      tile.attr('data-destination', capture ? 'capture' : 'move')
      tile.attr('data-knight-jump', jump)
    } else {
      tile.node.removeAttribute('data-destination')
      tile.node.removeAttribute('data-knight-jump')
    }
  }
}

function handleClick(position: CubeCoordinates) {
  if (reviewingHistory() || onlineSaving) return
  const key = getKey(position)
  const startKey = selected && getKey(selected)
  const piece = startKey && board.get(startKey)?.piece
  if (selected && startKey && piece && isPlayerTurn(piece)) {
    if (startKey === key) {
      if (pendingOnlinePath) { void submitOnlineMove(pendingOnlinePath); return }
      if (secondKnightJump) updateTurnAfterMove(currentPlayer)
      select(null)
      return
    }

    const via = doubleJumpRoutes.get(key)
    const powerMove = via !== undefined || secondKnightJump
    const afterFirst = via ? makeMove(board, selected, via, 'power', gameRules) : board
    const next = afterFirst && makeMove(afterFirst, via ?? selected, position, powerMove ? 'power' : 'normal', gameRules)
    if (next && afterFirst) {
      const canContinue = !powerMove && !board.get(key)?.piece && canDoubleJump(board, selected)
      if (onlineGame) {
        const name = (hex: CubeCoordinates) => getHexName(hex.q, hex.r)
        const path = [...(pendingOnlinePath ?? [name(selected)]), ...(via ? [name(via)] : []), name(position)]
        if (canContinue && legalMoves(next, position, 'power', gameRules).length > 0) {
          pendingOnlinePath = path
          board = next
          renderBoard()
          select(position, true)
          finishOnline.hidden = false
        } else {
          void submitOnlineMove(path)
        }
        return
      }
      const route = (via ? moveLeg(via, board) : '') + moveLeg(position, afterFirst)
      const cell = recordMove(piece, selected, route, next, secondKnightJump)
      const entry = { board: next, cell }
      if (secondKnightJump) history[history.length - 1] = entry
      else history.push(entry)
      viewedTurn = history.length - 1
      updateHistoryPosition()
      board = next
      tiles.get(startKey)?.renderPiece(null)
      if (via) tiles.get(getKey(via))?.renderPiece(null)
      tiles.get(key)?.renderPiece(board.get(key)?.piece ?? null)
      select(canContinue ? position : null, canContinue)
      updateTurnAfterMove(getPlayerNumber(piece.color), secondKnightJump)
      return
    }
  }

  if (pendingOnlinePath) { void submitOnlineMove(pendingOnlinePath); return }
  if (secondKnightJump) updateTurnAfterMove(currentPlayer)
  const target = board.get(key)?.piece
  select(target && isPlayerTurn(target) ? position : null)
}

function isMarkedDestination(key: string): boolean {
  return tiles.get(key)?.tile.node.hasAttribute('data-destination') ?? false
}

const cancelBoardPointer = bindBoardPointer(draw.node, {
  press(key) {
    if (reviewingHistory() || onlineSaving) return null
    const cell = board.get(key)
    if (!cell) return null

    const alreadySelected = selected && getKey(selected) === key
    const selectedOnPress = Boolean(cell.piece && !alreadySelected && !isMarkedDestination(key))
    if (selectedOnPress) handleClick(cell.position)

    const piece = selected && getKey(selected) === key ? tiles.get(key)?.pieceLabel.node ?? null : null
    return { piece, selectedOnPress }
  },
  click(key) {
    const position = board.get(key)?.position
    if (position) handleClick(position)
  },
  drop(key) {
    const position = board.get(key)?.position
    if (position && isMarkedDestination(key)) handleClick(position)
  },
})

function showHistoryTurn(turn: number) {
  if (turn === viewedTurn || pendingOnlinePath || onlineSaving) return
  cancelBoardPointer()
  history[viewedTurn].cell?.removeAttribute('aria-current')
  viewedTurn = turn
  const entry = history[turn]
  for (const [key, { renderPiece }] of tiles) {
    renderPiece(entry.board.get(key)?.piece ?? null)
  }
  if (reviewingHistory()) {
    entry.cell?.setAttribute('aria-current', 'step')
    entry.cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    if (!entry.cell && moveHistoryList) moveHistoryList.scrollTop = 0
  } else if (moveHistoryList) {
    moveHistoryList.scrollTop = moveHistoryList.scrollHeight
  }
  select(selected, secondKnightJump)
  updateHistoryPosition()
  updateTurnIndicator()
}

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]')) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, select, input:not([type="checkbox"])'))) return

  const latest = history.length - 1
  const turns = {
    ArrowLeft: Math.max(0, viewedTurn - 1),
    ArrowRight: Math.min(latest, viewedTurn + 1),
    ArrowUp: 0,
    ArrowDown: latest,
  }
  if (!Object.hasOwn(turns, event.key)) return
  event.preventDefault()
  showHistoryTurn(turns[event.key as keyof typeof turns])
})


function renderBoard() {
  const shown = reviewingHistory() ? history[viewedTurn].board : board
  for (const [key, { renderPiece }] of tiles) renderPiece(shown.get(key)?.piece ?? null)
}

function updateOnlineBoard(next: OnlineGame | null) {
  const savedLocalGame = localGame
  const sameRoom = next?.id === onlineGame?.id
  if (sameRoom && next?.revision === onlineGame?.revision) return
  cancelBoardPointer()

  if (next && !onlineGame) {
    localGame = {
      history: history.slice(), rows: Array.from(moveHistoryRows?.rows ?? []), viewedTurn, currentPlayer,
      lastMoveCell, lastMovePath, lastMovePlayer, selected, secondKnightJump,
    }
  }

  const reviewedTurn = sameRoom && reviewingHistory() ? viewedTurn : null
  onlineGame = next
  onlineSaving = false
  pendingOnlinePath = null
  finishOnline.hidden = true
  gameRules = next?.rules ?? DEFAULT_GAME_RULES
  moveHistoryRows?.replaceChildren()
  lastMovePlayer = 0
  lastMoveCell = null
  lastMovePath = ''

  if (next) {
    history.length = 0
    history.push({ board: restoreOnlineBoard(next.initial_board), cell: null })
    for (const move of next.moves) {
      const cell = addMoveCell(move.player)
      if (cell) cell.textContent = move.notation
      history.push({ board: restoreOnlineBoard(move.board_after), cell })
    }
    currentPlayer = next.current_player
    viewedTurn = reviewedTurn ?? history.length - 1
  } else if (savedLocalGame) {
    history.splice(0, history.length, ...savedLocalGame.history)
    moveHistoryRows?.replaceChildren(...savedLocalGame.rows)
    currentPlayer = savedLocalGame.currentPlayer
    viewedTurn = savedLocalGame.viewedTurn
    lastMoveCell = savedLocalGame.lastMoveCell
    lastMovePath = savedLocalGame.lastMovePath
    lastMovePlayer = savedLocalGame.lastMovePlayer
    localGame = null
  }

  if (moveHistoryRows && !moveHistoryRows.rows.length) {
    const row = moveHistoryRows.insertRow()
    for (const _ of PIECE_COLORS) row.insertCell()
  }
  board = history[history.length - 1].board
  select(next ? null : savedLocalGame?.selected ?? null, !next && savedLocalGame?.secondKnightJump)
  renderBoard()
  if (reviewingHistory()) history[viewedTurn].cell?.setAttribute('aria-current', 'step')
  else if (moveHistoryList) moveHistoryList.scrollTop = moveHistoryList.scrollHeight
  updateHistoryPosition()
  updateTurnIndicator()
}

const online = bindOnlinePlay(updateOnlineBoard)
const newGameDialog = document.querySelector<HTMLDialogElement>('#new-game-dialog')!
document.querySelector('#new-game-open')?.addEventListener('click', () => newGameDialog.showModal())
document.querySelector('#new-game-online')?.addEventListener('click', () => {
  newGameDialog.close()
  online.openLobby()
})

async function submitOnlineMove(path: string[]) {
  const game = onlineGame
  if (!game || onlineSaving) return
  onlineSaving = true
  finishOnline.hidden = true
  select(null)
  try {
    await online.move(game, path)
  } catch {
    if (onlineGame?.id === game.id) {
      pendingOnlinePath = null
      board = history[history.length - 1].board
      renderBoard()
    }
  } finally {
    if (onlineGame?.id === game.id) onlineSaving = false
  }
}

finishOnline.addEventListener('click', () => {
  if (pendingOnlinePath) void submitOnlineMove(pendingOnlinePath)
})
