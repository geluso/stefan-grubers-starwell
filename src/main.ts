import { SVG } from '@svgdotjs/svg.js'
import { defineHex, Grid, spiral } from 'honeycomb-grid'

import { PIECE_MAP } from './pieces'
import { COLOR_MAP } from './color-map'

// you may want the origin to be the top left corner of a hex's bounding box
// instead of its center (which is the default)
const Hex = defineHex({ dimensions: 30, origin: 'topLeft' })
const center = { q: 0, r: 0 }
const grid = new Grid(Hex, spiral({ start: center, radius: 5 }))

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

const getKey = ({ q, r, s }: InstanceType<typeof Hex>) => `(${q}, ${r}, ${s})`

grid.forEach((hex: Hex) => {
  const key = getKey(hex)
  const color = COLOR_MAP[key]
  console.log({ key, color })
})

const renderSVG = (hex: Hex) => {
  const key = getKey(hex)
  const color = COLOR_MAP[key]

  const polygon = draw
    .polygon(hex.corners.map(({ x, y }) => `${x},${y}`))
    .addClass('hex-tile')
    .fill(color)
    .stroke({ width: 1, color: '#999' })

  polygon.on('click', () => {
    console.log('Clicked hex:', hex.q, hex.r)
  })

  const tile = draw.group().add(polygon)
  const x = polygon.cx()
  const y = polygon.cy()

  const piece = PIECE_MAP[key]

  const pieceLabel = tile.plain(piece.text)
    .addClass('hex-piece')
    .font(pieceFont)
    .stroke('black')
    .fill(piece.color)
    .attr('pointer-events', 'none')

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

  tile.plain(`${hex.q}, ${hex.r}, ${hex.s}`)
    .addClass('hex-coordinates')
    .font({ size: 12, family: 'sans-serif' })
    .fill('black')
    .center(x, y)
    .attr('pointer-events', 'none')

  return tile
}

grid.forEach(renderSVG)

