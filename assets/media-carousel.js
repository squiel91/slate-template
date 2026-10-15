/**
 * Draggable product media carousel.
 *
 * Public controller:
 *   goTo(index)
 *   next()
 *   prev()
 *   getIndex()
 *   goToImageId(imageId)
 *   destroy()
 *
 * Video slides autoplay when they become the active slide and pause otherwise.
 * Does not loop: first/last edges refuse wrapping and resist further drag.
 */

const DRAG_THRESHOLD = 48
const AXIS_LOCK_PX = 10
const EDGE_RESISTANCE = 0.28
const STREAM_SDK_SRC = "https://embed.cloudflarestream.com/embed/sdk.latest.js"
const streamPlayers = new WeakMap()
let streamSdkPromise = null

function parseVideo(url) {
  if (!url) return null
  const youtube = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/)
  if (youtube) return { kind: "youtube", id: youtube[1] }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return { kind: "vimeo", id: vimeo[1] }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const segments = parsed.pathname.split("/").filter(Boolean)
    const isStream =
      host === "iframe.videodelivery.net" ||
      host === "videodelivery.net" ||
      host.endsWith(".cloudflarestream.com")
    if (isStream && segments.length) {
      const last = segments[segments.length - 1]
      const uid = last === "iframe" ? segments[segments.length - 2] : last
      if (!uid) return { kind: "file", src: url }
      const src = host.endsWith(".cloudflarestream.com")
        ? `${parsed.origin}/${uid}/iframe`
        : `https://iframe.videodelivery.net/${uid}`
      return {
        kind: "stream",
        id: uid,
        src,
        poster: `https://videodelivery.net/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg?time=1s&height=640`,
      }
    }
  } catch {
    // Fall through to native file playback.
  }

  return { kind: "file", src: url }
}

function postPlayerCommand(iframe, payload, targetOrigin) {
  iframe?.contentWindow?.postMessage(payload, targetOrigin)
}

function loadStreamSdk() {
  if (window.Stream) return Promise.resolve(window.Stream)
  if (streamSdkPromise) return streamSdkPromise
  streamSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = STREAM_SDK_SRC
    script.async = true
    script.onload = () => {
      if (window.Stream) resolve(window.Stream)
      else reject(new Error("Stream SDK missing"))
    }
    script.onerror = () => reject(new Error("Stream SDK failed to load"))
    document.head.append(script)
  })
  return streamSdkPromise
}

function fallbackStreamSrc(iframe, shouldPlay) {
  try {
    const src = new URL(iframe.src)
    if (shouldPlay) {
      src.searchParams.set("autoplay", "true")
      src.searchParams.set("muted", "true")
    } else {
      src.searchParams.delete("autoplay")
    }
    const next = src.toString()
    if (iframe.src !== next) iframe.src = next
  } catch {
    // Ignore malformed iframe URLs.
  }
}

function controlStream(iframe, command) {
  const run = (player) => {
    if (command === "play") {
      player.muted = true
      const playback = player.play?.()
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          player.muted = true
          player.play?.()
        })
      }
      return
    }
    player.pause?.()
  }

  const existing = streamPlayers.get(iframe)
  if (existing) {
    run(existing)
    return
  }

  loadStreamSdk()
    .then((Stream) => {
      const player = Stream(iframe)
      streamPlayers.set(iframe, player)
      run(player)
    })
    .catch(() => fallbackStreamSrc(iframe, command === "play"))
}

function createPlayerIframe(src, { allow }) {
  const iframe = document.createElement("iframe")
  iframe.src = src
  iframe.title = "Video del producto"
  iframe.allow = allow
  iframe.setAttribute("allowfullscreen", "")
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
  return iframe
}

function ensureVideo(slide) {
  const host = slide.querySelector("[data-video-host]")
  if (!(host instanceof HTMLElement) || host.dataset.ready === "true") return

  const parsed = parseVideo(slide.dataset.videoUrl || "")
  if (!parsed) return

  if (parsed.kind === "youtube") {
    host.append(
      createPlayerIframe(
        `https://www.youtube.com/embed/${parsed.id}?enablejsapi=1&mute=1&playsinline=1&rel=0&autoplay=1`,
        { allow: "autoplay; encrypted-media; picture-in-picture" }
      )
    )
  } else if (parsed.kind === "vimeo") {
    host.append(
      createPlayerIframe(`https://player.vimeo.com/video/${parsed.id}?muted=1&autoplay=1`, {
        allow: "autoplay; encrypted-media; picture-in-picture",
      })
    )
  } else if (parsed.kind === "stream") {
    const src = new URL(parsed.src)
    src.searchParams.set("autoplay", "true")
    src.searchParams.set("muted", "true")
    src.searchParams.set("loop", "true")
    const iframe = createPlayerIframe(src.toString(), {
      allow: "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture",
    })
    iframe.addEventListener(
      "load",
      () => {
        iframe.dataset.streamReady = "true"
        if (!slide.hasAttribute("data-active")) controlStream(iframe, "pause")
      },
      { once: true }
    )
    host.append(iframe)
  } else {
    const video = document.createElement("video")
    video.src = parsed.src
    video.muted = true
    video.playsInline = true
    video.loop = true
    video.controls = true
    video.setAttribute("autoplay", "")
    host.append(video)
  }

  host.dataset.ready = "true"
}

function playSlideMedia(slide) {
  if (!(slide instanceof HTMLElement) || slide.dataset.slideType !== "video") return
  ensureVideo(slide)
  const video = slide.querySelector("video")
  if (video instanceof HTMLVideoElement) video.play().catch(() => {})
  const iframe = slide.querySelector("iframe")
  if (!(iframe instanceof HTMLIFrameElement)) return
  if (iframe.src.includes("youtube")) {
    postPlayerCommand(iframe, JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*")
  } else if (iframe.src.includes("vimeo")) {
    postPlayerCommand(iframe, JSON.stringify({ method: "play" }), "*")
  } else {
    controlStream(iframe, "play")
  }
}

function pauseSlideMedia(slide) {
  if (!(slide instanceof HTMLElement) || slide.dataset.slideType !== "video") return
  const video = slide.querySelector("video")
  if (video instanceof HTMLVideoElement) video.pause()
  const iframe = slide.querySelector("iframe")
  if (!(iframe instanceof HTMLIFrameElement)) return
  if (iframe.src.includes("youtube")) {
    postPlayerCommand(iframe, JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*")
  } else if (iframe.src.includes("vimeo")) {
    postPlayerCommand(iframe, JSON.stringify({ method: "pause" }), "*")
  } else {
    controlStream(iframe, "pause")
  }
}

export function hydrateProductVideo(root) {
  if (!(root instanceof HTMLElement)) return
  const slide = root.querySelector(".product-media [data-slide-type='video']")
  if (slide instanceof HTMLElement) playSlideMedia(slide)
}

function resistDelta(delta, atStart, atEnd) {
  if ((atStart && delta > 0) || (atEnd && delta < 0)) return delta * EDGE_RESISTANCE
  return delta
}

/**
 * Shared lightbox for carousel or single product image.
 * Open/close matches human-theme: fade + slight scale (no View Transitions).
 * @param {HTMLElement} root
 * @param {() => HTMLImageElement | null} getSourceImage
 */
export function bindMediaLightbox(root, getSourceImage) {
  const lightbox = root.querySelector("[data-media-lightbox]")
  const lightboxImage = root.querySelector("[data-lightbox-image]")
  const expandButton = root.querySelector("[data-carousel-expand]")
  if (!(lightbox instanceof HTMLElement) || !(lightboxImage instanceof HTMLImageElement)) {
    return {
      open() {},
      close() {},
      destroy() {},
    }
  }

  let open = false
  let closeTimer = 0
  const cleanups = []
  const on = (target, event, handler) => {
    target.addEventListener(event, handler)
    cleanups.push(() => target.removeEventListener(event, handler))
  }

  const viewportSize = () => {
    const viewport = window.visualViewport
    return {
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    }
  }

  const fitLightboxImage = () => {
    const naturalWidth = lightboxImage.naturalWidth
    const naturalHeight = lightboxImage.naturalHeight
    if (!naturalWidth || !naturalHeight) return

    const { width: viewportWidth, height: viewportHeight } = viewportSize()
    const scale = Math.min(1, viewportWidth / naturalWidth, viewportHeight / naturalHeight)
    lightboxImage.style.width = `${naturalWidth * scale}px`
    lightboxImage.style.height = `${naturalHeight * scale}px`
  }

  const clearLightboxImage = () => {
    lightboxImage.removeAttribute("src")
    lightboxImage.removeAttribute("width")
    lightboxImage.removeAttribute("height")
    lightboxImage.style.width = ""
    lightboxImage.style.height = ""
    lightboxImage.alt = ""
  }

  const setOpen = (nextOpen) => {
    if (closeTimer) {
      window.clearTimeout(closeTimer)
      closeTimer = 0
    }

    if (nextOpen) {
      if (open) return
      const source = getSourceImage()
      if (!(source instanceof HTMLImageElement)) return

      lightboxImage.src = source.currentSrc || source.src
      lightboxImage.alt = source.alt || ""
      if (lightboxImage.complete) fitLightboxImage()
      document.body.appendChild(lightbox)
      lightbox.hidden = false
      lightbox.setAttribute("aria-hidden", "false")
      window.requestAnimationFrame(() => {
        lightbox.dataset.open = "true"
      })
      open = true
      return
    }

    if (!open) return
    lightbox.dataset.open = "false"
    lightbox.setAttribute("aria-hidden", "true")
    closeTimer = window.setTimeout(() => {
      lightbox.hidden = true
      clearLightboxImage()
      if (!root.contains(lightbox)) root.appendChild(lightbox)
      closeTimer = 0
      open = false
    }, 260)
  }

  on(lightboxImage, "load", fitLightboxImage)
  const refitIfOpen = () => {
    if (open) fitLightboxImage()
  }
  on(window, "resize", refitIfOpen)
  if (window.visualViewport) on(window.visualViewport, "resize", refitIfOpen)

  if (expandButton) {
    on(expandButton, "click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      setOpen(true)
    })
  }

  for (const close of root.querySelectorAll("[data-lightbox-close]")) {
    on(close, "click", () => setOpen(false))
  }
  on(lightbox, "click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest("[data-lightbox-close]")) setOpen(false)
  })

  on(document, "keydown", (event) => {
    if (event.key === "Escape" && open) setOpen(false)
  })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      if (closeTimer) window.clearTimeout(closeTimer)
      open = false
      lightbox.hidden = true
      lightbox.dataset.open = "false"
      cleanups.forEach((fn) => fn())
    },
  }
}

/**
 * @param {HTMLElement} root
 * @returns {{
 *   goTo: (index: number) => void,
 *   next: () => void,
 *   prev: () => void,
 *   getIndex: () => number,
 *   goToImageId: (imageId: string) => boolean,
 *   destroy: () => void
 * }}
 */
export function createMediaCarousel(root) {
  const track = root.querySelector("[data-carousel-track]")
  const viewport = root.querySelector("[data-carousel-viewport]")
  const slides = [...root.querySelectorAll("[data-carousel-slide]")]
  const thumbs = [...root.querySelectorAll("[data-carousel-thumb]")]
  const prevButton = root.querySelector("[data-carousel-prev]")
  const nextButton = root.querySelector("[data-carousel-next]")
  if (!(track instanceof HTMLElement) || !(viewport instanceof HTMLElement) || slides.length === 0) {
    return {
      goTo() {},
      next() {},
      prev() {},
      getIndex() { return 0 },
      goToImageId() { return false },
      destroy() {},
    }
  }

  let index = 0
  let pointerId = null
  let dragStartX = 0
  let dragStartY = 0
  let dragDelta = 0
  let dragging = false
  let dragAxis = null
  const last = slides.length - 1
  const cleanups = []

  const on = (target, event, handler, options) => {
    target.addEventListener(event, handler, options)
    cleanups.push(() => target.removeEventListener(event, handler, options))
  }

  const getActiveImage = () => {
    const slide = slides[index]
    if (!(slide instanceof HTMLElement) || slide.dataset.slideType === "video") return null
    const image = slide.querySelector("img")
    return image instanceof HTMLImageElement ? image : null
  }

  const lightbox = bindMediaLightbox(root, getActiveImage)

  const syncNav = () => {
    if (prevButton instanceof HTMLButtonElement) {
      prevButton.disabled = index <= 0
      prevButton.setAttribute("aria-disabled", String(index <= 0))
    }
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.disabled = index >= last
      nextButton.setAttribute("aria-disabled", String(index >= last))
    }
  }

  const render = (nextIndex, { animate = true } = {}) => {
    index = Math.max(0, Math.min(last, nextIndex))
    track.classList.toggle("is-dragging", !animate)
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index
      slide.toggleAttribute("data-active", active)
      if (active) playSlideMedia(slide)
      else pauseSlideMedia(slide)
    })
    thumbs.forEach((thumb, thumbIndex) => {
      if (thumbIndex === index) thumb.setAttribute("aria-current", "true")
      else thumb.removeAttribute("aria-current")
    })
    syncNav()
  }

  const goTo = (nextIndex) => render(nextIndex, { animate: true })
  const next = () => {
    if (index >= last) return
    goTo(index + 1)
  }
  const prev = () => {
    if (index <= 0) return
    goTo(index - 1)
  }

  const goToImageId = (imageId) => {
    const found = slides.findIndex(
      (slide) => slide.dataset.slideType === "image" && slide.dataset.imageId === String(imageId || "")
    )
    if (found < 0) return false
    goTo(found)
    return true
  }

  thumbs.forEach((thumb, thumbIndex) => {
    on(thumb, "click", () => goTo(thumbIndex))
  })
  if (prevButton) on(prevButton, "click", (event) => {
    event.stopPropagation()
    prev()
  })
  if (nextButton) on(nextButton, "click", (event) => {
    event.stopPropagation()
    next()
  })

  const resetDrag = () => {
    pointerId = null
    dragging = false
    dragAxis = null
    dragDelta = 0
    track.classList.remove("is-dragging")
  }

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (event.target instanceof Element && event.target.closest("button, a, iframe, video")) return
    pointerId = event.pointerId
    dragStartX = event.clientX
    dragStartY = event.clientY
    dragDelta = 0
    dragging = false
    dragAxis = null
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
      dragging = true
      track.classList.add("is-dragging")
      viewport.setPointerCapture?.(event.pointerId)
    }

    if (dragAxis !== "x") return
    event.preventDefault()
    dragDelta = dx
    const resisted = resistDelta(dragDelta, index <= 0, index >= last)
    const percent = (resisted / viewport.offsetWidth) * 100
    track.style.transform = `translate3d(${-index * 100 + percent}%, 0, 0)`
  }

  const onPointerUp = (event) => {
    if (pointerId !== event.pointerId) return
    const axis = dragAxis
    const delta = dragDelta
    resetDrag()

    if (event.type === "pointercancel" || axis === "y") {
      goTo(index)
      return
    }

    if (axis === "x") {
      const atStart = index <= 0
      const atEnd = index >= last
      if (delta > DRAG_THRESHOLD && !atStart) prev()
      else if (delta < -DRAG_THRESHOLD && !atEnd) next()
      else goTo(index)
      return
    }

    goTo(index)
    if (
      getActiveImage() &&
      !(event.target instanceof Element && event.target.closest("button"))
    ) {
      lightbox.open?.()
    }
  }

  on(viewport, "pointerdown", onPointerDown)
  on(window, "pointermove", onPointerMove, { passive: false })
  on(window, "pointerup", onPointerUp)
  on(window, "pointercancel", onPointerUp)

  render(0, { animate: false })

  return {
    goTo,
    next,
    prev,
    getIndex: () => index,
    goToImageId,
    destroy() {
      slides.forEach(pauseSlideMedia)
      lightbox.destroy?.()
      cleanups.forEach((fn) => fn())
    },
  }
}
