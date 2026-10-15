/**
 * Homepage hero carousel.
 * Finite (no loop), pointer-draggable, with rubber-band resistance at the ends.
 */

const DRAG_THRESHOLD = 36
const AXIS_LOCK_PX = 8
const EDGE_RESISTANCE = 0.22
const FLICK_VELOCITY = 0.55

function resistDelta(delta, atStart, atEnd) {
  if ((atStart && delta > 0) || (atEnd && delta < 0)) return delta * EDGE_RESISTANCE
  return delta
}

/**
 * @param {HTMLElement} root
 * @returns {{ destroy: () => void }}
 */
export function createHeroCarousel(root) {
  const track = root.querySelector("[data-carousel-track]")
  const viewport = root.querySelector("[data-carousel-viewport]")
  const slides = [...root.querySelectorAll("[data-carousel-slide]")]
  const dots = [...root.querySelectorAll("[data-carousel-dot]")]
  if (!(track instanceof HTMLElement) || !(viewport instanceof HTMLElement) || slides.length === 0) {
    return { destroy() {} }
  }

  let index = 0
  let pointerId = null
  let dragStartX = 0
  let dragStartY = 0
  let dragDelta = 0
  let dragAxis = null
  let lastMoveX = 0
  let lastMoveAt = 0
  let velocity = 0
  let autoplayTimer = 0
  let autoplayDirection = 1
  let hoverPause = false
  let dragPause = false
  const last = slides.length - 1
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const autoplayEnabled = root.dataset.autoplay !== "false" && last > 0 && !reducedMotion
  const autoplayMs = Math.max(2500, Number(root.dataset.autoplayMs) || 5500)
  const cleanups = []

  const on = (target, event, handler, options) => {
    target.addEventListener(event, handler, options)
    cleanups.push(() => target.removeEventListener(event, handler, options))
  }

  const render = (nextIndex, { animate = true } = {}) => {
    index = Math.max(0, Math.min(last, nextIndex))
    track.classList.toggle("is-dragging", !animate)
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index
      slide.toggleAttribute("data-active", active)
      slide.setAttribute("aria-hidden", String(!active))
    })
    dots.forEach((dot, dotIndex) => {
      if (dotIndex === index) dot.setAttribute("aria-current", "true")
      else dot.removeAttribute("aria-current")
    })
    root.dataset.slide = String(index)
  }

  const stopAutoplay = () => {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer)
      autoplayTimer = 0
    }
  }

  const isPaused = () => hoverPause || dragPause || document.hidden

  const stepAutoplay = () => {
    if (isPaused()) return
    if (index >= last) autoplayDirection = -1
    else if (index <= 0) autoplayDirection = 1
    if (autoplayDirection > 0) next()
    else prev()
  }

  const startAutoplay = () => {
    stopAutoplay()
    if (!autoplayEnabled || isPaused()) return
    autoplayTimer = window.setInterval(stepAutoplay, autoplayMs)
  }

  const goTo = (nextIndex) => {
    render(nextIndex, { animate: !reducedMotion })
    startAutoplay()
  }
  const next = () => {
    if (index >= last) return
    goTo(index + 1)
  }
  const prev = () => {
    if (index <= 0) return
    goTo(index - 1)
  }

  dots.forEach((dot, dotIndex) => {
    on(dot, "click", () => goTo(dotIndex))
  })

  const resetDrag = () => {
    pointerId = null
    dragAxis = null
    dragDelta = 0
    velocity = 0
    track.classList.remove("is-dragging")
  }

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (event.target instanceof Element && event.target.closest("a, button")) return
    pointerId = event.pointerId
    dragStartX = event.clientX
    dragStartY = event.clientY
    lastMoveX = event.clientX
    lastMoveAt = event.timeStamp
    dragDelta = 0
    velocity = 0
    dragAxis = null
    dragPause = true
    stopAutoplay()
  }

  const onPointerMove = (event) => {
    if (pointerId !== event.pointerId || dragAxis === "y") return
    const dx = event.clientX - dragStartX
    const dy = event.clientY - dragStartY

    if (dragAxis === null) {
      if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        dragAxis = "y"
        return
      }
      dragAxis = "x"
      track.classList.add("is-dragging")
      viewport.setPointerCapture?.(event.pointerId)
    }

    if (dragAxis !== "x") return
    event.preventDefault()
    const elapsed = event.timeStamp - lastMoveAt || 1
    velocity = (event.clientX - lastMoveX) / elapsed
    lastMoveX = event.clientX
    lastMoveAt = event.timeStamp
    dragDelta = dx
    const resisted = resistDelta(dragDelta, index <= 0, index >= last)
    const percent = (resisted / viewport.offsetWidth) * 100
    track.style.transform = `translate3d(${-index * 100 + percent}%, 0, 0)`
  }

  const onPointerUp = (event) => {
    if (pointerId !== event.pointerId) return
    const axis = dragAxis
    const delta = dragDelta
    const flick = velocity
    dragPause = false
    resetDrag()

    if (event.type === "pointercancel" || axis === "y") {
      goTo(index)
      return
    }

    if (axis === "x") {
      const atStart = index <= 0
      const atEnd = index >= last
      const flickedPrev = flick > FLICK_VELOCITY
      const flickedNext = flick < -FLICK_VELOCITY
      if ((delta > DRAG_THRESHOLD || flickedPrev) && !atStart) prev()
      else if ((delta < -DRAG_THRESHOLD || flickedNext) && !atEnd) next()
      else goTo(index)
      return
    }

    startAutoplay()
  }

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      next()
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      prev()
    }
  }

  on(viewport, "pointerdown", onPointerDown)
  on(window, "pointermove", onPointerMove, { passive: false })
  on(window, "pointerup", onPointerUp)
  on(window, "pointercancel", onPointerUp)
  on(root, "keydown", onKeyDown)
  on(root, "mouseenter", () => {
    hoverPause = true
    stopAutoplay()
  })
  on(root, "mouseleave", () => {
    hoverPause = false
    startAutoplay()
  })
  on(root, "focusin", () => {
    hoverPause = true
    stopAutoplay()
  })
  on(root, "focusout", (event) => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
    hoverPause = false
    startAutoplay()
  })
  on(document, "visibilitychange", () => {
    if (document.hidden) stopAutoplay()
    else startAutoplay()
  })

  render(0, { animate: false })
  startAutoplay()

  return {
    destroy() {
      stopAutoplay()
      cleanups.forEach((fn) => fn())
    },
  }
}

export function initHeroCarousels() {
  for (const root of document.querySelectorAll("[data-hero-carousel]")) {
    if (!(root instanceof HTMLElement) || root.dataset.carouselReady === "true") continue
    root.dataset.carouselReady = "true"
    createHeroCarousel(root)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeroCarousels)
} else {
  initHeroCarousels()
}
