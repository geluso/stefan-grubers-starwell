import type { CubeCoordinates, Point } from 'honeycomb-grid'

export type ViewPlayer = 1 | 2 | 3
export type BoardRotation = 0 | 1 | 2 | 3 | 4 | 5

export function rotationForPlayer(player: ViewPlayer): BoardRotation {
  return player === 1 ? 0 : player === 2 ? 4 : 2
}

export function rotateViewClockwise(rotation: BoardRotation): BoardRotation {
  return ((rotation + 1) % 6) as BoardRotation
}

export function viewHexPosition(position: CubeCoordinates, rotation: BoardRotation): CubeCoordinates {
  let view = position
  for (let step = 0; step < rotation; step++) {
    const { q, r, s } = view
    view = { q: -r, r: -s, s: -q }
  }
  return view
}

export function viewOffset({ x, y }: Point, rotation: BoardRotation): Point {
  const angle = rotation * Math.PI / 3
  const sine = Math.sin(angle)
  const cosine = Math.cos(angle)
  return { x: cosine * x - sine * y, y: sine * x + cosine * y }
}
