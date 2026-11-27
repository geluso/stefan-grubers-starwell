import { SVG } from '@svgdotjs/svg.js'
import { defineHex, Grid, spiral, type CubeCoordinates } from 'honeycomb-grid'

import { COLOR_MAP } from './color-map'
import { createBoard, getKey, legalMoves, makeMove } from './moves'
import type { Piece } from './pieces'

// you may want the origin to be the top left corner of a hex's bounding box
// instead of its center (which is the default)
const Hex = defineHex({ dimensions: 30, origin: 'topLeft' })
const center = { q: 0, r: 0 }
const grid = new Grid(Hex, spiral({ start: center, radius: 5 }))
let board = createBoard(grid)
let selected: CubeCoordinates | null = null

const draw = SVG().addTo('body').size('100%', '100%')
const pieceFont = { size: 48, family: 'sans-serif' }
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

draw.viewbox(
  left - padding,
  top - padding,
  Math.max(...xs) - left + padding * 2,
  Math.max(...ys) - top + padding * 2,
)

const renderSVG = (hex: InstanceType<typeof Hex>) => {
  const key = getKey(hex)
  const color = COLOR_MAP[key as keyof typeof COLOR_MAP]
  const tile = draw.group()

  const polygon = tile
    .polygon(hex.corners.map(({ x, y }) => `${x},${y}`))
    .addClass('hex-tile')
    .fill(color)

  polygon.on('click', () => handleClick(hex))

  const x = polygon.cx()
  const y = polygon.cy()

  const pieceLabel = tile.plain('')
    .addClass('hex-piece')
    .font(pieceFont)
    .stroke('black')
    .attr('pointer-events', 'none')

  tile.plain(`${hex.q}, ${hex.r}, ${hex.s}`)
    .addClass('hex-coordinates')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .center(x, y + 23)
    .attr('pointer-events', 'none')

  const moveDot = tile.circle(11)
    .addClass('hex-move-dot')
    .fill('#222')
    .stroke({ color: 'white', width: 2 })
    .attr('pointer-events', 'none')
    .hide()

  function renderPiece(piece: Piece | null) {
    pieceLabel.plain(piece?.text ?? '')
    if (piece) {
      pieceLabel.fill(piece.color)
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

    // Keep a capture dot beside the glyph so both are visible.
    moveDot.center(piece ? x + 17 : x, piece ? y - 15 : y)
  }

  renderPiece(board.get(key)?.piece ?? null)
  return { renderPiece, moveDot }
}

const tiles = new Map(grid.toArray().map(hex => [getKey(hex), renderSVG(hex)]))

function select(position: CubeCoordinates | null) {
  selected = position
  const destinations = new Set(position ? legalMoves(board, position).map(getKey) : [])
  for (const [key, { moveDot }] of tiles) {
    if (destinations.has(key)) moveDot.show()
    else moveDot.hide()
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

