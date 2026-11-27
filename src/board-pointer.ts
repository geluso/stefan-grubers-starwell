const dragThreshold = 5

type BoardPress = {
  piece: SVGElement | null
  selectedOnPress: boolean
}

type Gesture = BoardPress & {
  id: number
  key: string
  origin: DOMPoint
  moved: boolean
  ghost?: SVGElement
}

export function bindBoardPointer(svg: SVGSVGElement, actions: {
  press: (key: string) => BoardPress | null
  click: (key: string) => void
  drop: (key: string) => void
}): () => void {
  let gesture: Gesture | null = null

  function tileKey(target: EventTarget | null): string | null {
    if (!(target instanceof Element) || !svg.contains(target)) return null
    return target.closest('[data-hex-key]')?.getAttribute('data-hex-key') ?? null
  }

  function cancel() {
    const active = gesture
    if (!active) return
    gesture = null
    active.ghost?.remove()
    active.piece?.classList.remove('is-dragged')
    if (svg.hasPointerCapture(active.id)) svg.releasePointerCapture(active.id)
  }

  svg.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || gesture) return
    const key = tileKey(event.target)
    if (!key) return
    const press = actions.press(key)
    if (!press) return
    gesture = { ...press, id: event.pointerId, key, origin: new DOMPoint(event.clientX, event.clientY), moved: false }
    svg.setPointerCapture(event.pointerId)
  })

  svg.addEventListener('pointermove', event => {
    const active = gesture
    if (!active || active.id !== event.pointerId) return
    const pointer = new DOMPoint(event.clientX, event.clientY)
    if (Math.hypot(pointer.x - active.origin.x, pointer.y - active.origin.y) >= dragThreshold) active.moved = true
    if (!active.moved || !active.piece) return

    if (!active.ghost) {
      const ghost = active.piece.cloneNode(true) as SVGElement
      ghost.removeAttribute('id')
      ghost.classList.add('hex-drag-ghost')
      ghost.setAttribute('aria-hidden', 'true')
      svg.append(ghost)
      active.ghost = ghost
      active.piece.classList.add('is-dragged')
    }

    const screenTransform = svg.getScreenCTM()?.inverse()
    if (!screenTransform) return
    const start = active.origin.matrixTransform(screenTransform)
    const end = pointer.matrixTransform(screenTransform)
    active.ghost.setAttribute('transform', `translate(${end.x - start.x} ${end.y - start.y})`)
  })

  svg.addEventListener('pointerup', event => {
    const active = gesture
    if (!active || active.id !== event.pointerId) return
    const key = tileKey(document.elementFromPoint(event.clientX, event.clientY))
    cancel()
    if (!key) return
    const moved = active.moved || Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) >= dragThreshold
    if (moved) {
      if (active.piece && active.key !== key) actions.drop(key)
    } else if (active.key === key && !active.selectedOnPress) {
      actions.click(key)
    }
  })

  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    svg.addEventListener(type, event => {
      if (gesture?.id === event.pointerId) cancel()
    })
  }

  // Programmatic activation has no pointer gesture.
  svg.addEventListener('click', event => {
    if (event.isTrusted) return
    const key = tileKey(event.target)
    if (key) actions.click(key)
  })

  return cancel
}
