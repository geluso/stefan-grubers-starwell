import { SVG } from '@svgdotjs/svg.js'
import { defineHex, Grid, spiral, type CubeCoordinates, type Point } from 'honeycomb-grid'

import { COLOR_MAP } from './color-map'
import { exportGameState } from './game-state'
import { BOARD_RADIUS, createBoard, getHexName, getKey, legalMoves, makeMove } from './moves'
import type { Piece } from './pieces'

// you may want the origin to be the top left corner of a hex's bounding box
// instead of its center (which is the default)
const Hex = defineHex({ dimensions: 30, origin: 'topLeft' })
const center = { q: 0, r: 0 }
const grid = new Grid(Hex, spiral({ start: center, radius: BOARD_RADIUS }))
let board = createBoard(grid)
let selected: CubeCoordinates | null = null

const draw = SVG().addTo('body').addClass('starwell-board').size('100%', '100%')
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

  if (playable) polygon.on('click', () => handleClick(hex))

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
  return { renderPiece, tile }
}

const tiles = new Map(grid.toArray().map(hex => [getKey(hex), renderSVG(hex)]))

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
const exportStatus = document.querySelector('#export-status')

if (exportDialog && jsonPreview && asciiPreview && exportStatus) {
  const formats = ([
    { key: 'json', name: 'JSON', preview: jsonPreview, filename: 'starwell-game-state.json', type: 'application/json' },
    { key: 'ascii', name: 'ASCII', preview: asciiPreview, filename: 'starwell-game-state.txt', type: 'text/plain' },
  ] as const).map(format => {
    const section = format.preview.closest('.export-format')
    const lineNumbers = section?.querySelector<HTMLPreElement>('.export-line-gutter pre')
    return { ...format, section, lineNumbers }
  })

  document.querySelector('#export-game-state')?.addEventListener('click', () => {
    const snapshot = exportGameState(board)
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

const outlines = document.querySelector<HTMLInputElement>('#piece-outlines')
if (outlines) {
  const updateOutlines = () => draw.node.classList.toggle('piece-outlines-hidden', !outlines.checked)
  updateOutlines()
  outlines.addEventListener('change', updateOutlines)
}

for (const row of document.querySelectorAll<HTMLElement>('[data-palette-for]')) {
  const paletteAttribute = `data-${row.dataset.paletteFor}-palette`
  const target = row.dataset.paletteFor === 'sky' ? document.documentElement : draw.node
  const buttons = row.querySelectorAll<HTMLButtonElement>('button[data-palette]')
  const initialPalette = row.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.dataset.palette
  if (initialPalette) target.setAttribute(paletteAttribute, initialPalette)

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const palette = button.dataset.palette ?? 'original'
      target.setAttribute(paletteAttribute, palette)
      for (const option of buttons) {
        option.setAttribute('aria-pressed', String(option === button))
      }
    })
  }
}

function select(position: CubeCoordinates | null) {
  selected = position
  const destinations = new Set(position ? legalMoves(board, position).map(getKey) : [])
  for (const [key, { tile }] of tiles) {
    if (destinations.has(key)) {
      tile.attr('data-destination', board.get(key)?.piece ? 'capture' : 'move')
    } else {
      tile.node.removeAttribute('data-destination')
    }
  }
}

function handleClick(position: CubeCoordinates) {
  const key = getKey(position)
  if (selected) {
    const startKey = getKey(selected)
    if (startKey === key) {
      select(null)
      return
    }

    const next = makeMove(board, selected, position)
    if (next) {
      board = next
      tiles.get(startKey)?.renderPiece(null)
      tiles.get(key)?.renderPiece(board.get(key)?.piece ?? null)
      select(null)
      return
    }
  }

  select(board.get(key)?.piece ? position : null)
}

