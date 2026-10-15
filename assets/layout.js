const tiendu = window.Tiendu()
const storeCurrency = document.body?.dataset.storeCurrency || "UYU"

function updateCartQuantity(quantity) {
  const value = Math.max(0, Number(quantity) || 0)
  for (const badge of document.querySelectorAll("[data-cart-quantity]")) {
    const previous = Number(badge.dataset.displayedQuantity || 0)
    badge.textContent = String(value)
    if (badge._hideTimer) {
      window.clearTimeout(badge._hideTimer)
      badge._hideTimer = 0
    }

    const finishHide = () => {
      badge.hidden = true
      badge.classList.remove("is-hiding")
      badge.removeEventListener("animationend", finishHide)
    }

    if (value > 0) {
      badge.hidden = false
      badge.classList.remove("is-hiding")
      if (previous === 0) {
        badge.classList.remove("is-visible")
        void badge.offsetWidth
        badge.classList.add("is-visible")
      } else {
        badge.classList.add("is-visible")
      }
    } else if (previous > 0) {
      badge.classList.remove("is-visible")
      badge.classList.add("is-hiding")
      badge.addEventListener("animationend", finishHide)
      badge._hideTimer = window.setTimeout(finishHide, 240)
    } else {
      badge.hidden = true
      badge.classList.remove("is-hiding", "is-visible")
    }
    badge.dataset.displayedQuantity = String(value)
  }
}

const OVERLAY_TIMEOUT = 4000

function closeOverlayIframe() {
  const iframe = document.getElementById("left-iframe")
  if (!(iframe instanceof HTMLIFrameElement)) return
  iframe.dispatchEvent(new Event("error"))
  iframe.remove()
}

async function openStoreOverlay(button, opener) {
  if (button instanceof HTMLElement) {
    button.classList.add("is-loading")
    button.setAttribute("aria-busy", "true")
  }

  const opening = Promise.resolve().then(opener)
  opening.catch(() => {})

  const outcome = await Promise.race([
    opening.then(() => "ready").catch(() => "error"),
    new Promise((resolve) => window.setTimeout(() => resolve("timeout"), OVERLAY_TIMEOUT)),
  ])

  if (outcome !== "ready") closeOverlayIframe()

  if (button instanceof HTMLElement) {
    button.classList.remove("is-loading")
    button.removeAttribute("aria-busy")
  }
}

async function syncCartQuantity() {
  try {
    const result = await tiendu.cart.getQuantity()
    updateCartQuantity(result.quantity)
  } catch {
    updateCartQuantity(0)
  }
}

function selectedVariant(form, button) {
  const select = form.querySelector("[data-variant-select]")
  const option = select instanceof HTMLSelectElement ? select.selectedOptions[0] : null
  const id = Number(option?.value || button.dataset.variantId)
  if (!Number.isFinite(id) || id <= 0) return null

  const price = Number(option?.dataset.priceInCents || button.dataset.priceInCents)
  return Number.isFinite(price) ? { id, priceInCents: price } : { id }
}

function initCart() {
  document.addEventListener("click", (event) => {
    const cartButton = event.target.closest('[data-action="open-cart"]')
    if (cartButton) {
      openStoreOverlay(cartButton, () =>
        tiendu.cart.open((result) => updateCartQuantity(result.updatedCartItemsQuantity))
      )
      return
    }

    const quantityButton = event.target.closest("[data-quantity-decrease], [data-quantity-increase]")
    if (!quantityButton) return
    const input = quantityButton.closest("[data-product-form]")?.querySelector('input[name="quantity"]')
    if (!(input instanceof HTMLInputElement)) return

    const current = Math.max(1, Math.floor(Number(input.value) || 1))
    const maximum = input.max ? Number(input.max) : Number.POSITIVE_INFINITY
    input.value = quantityButton.matches("[data-quantity-increase]")
      ? String(Math.min(maximum, current + 1))
      : String(Math.max(1, current - 1))
  })

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-product-form]")
    if (!(form instanceof HTMLFormElement)) return
    if (form.closest("[data-product-root]")) return
    event.preventDefault()

    const button = form.querySelector('[data-action="add-to-cart"]')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return
    const variant = selectedVariant(form, button)
    if (!variant) return

    const quantityInput = form.querySelector('input[name="quantity"]')
    const error = form.querySelector("[data-product-error]")
    const quantity = Math.max(1, Math.floor(Number(quantityInput?.value) || 1))
    const originalText = button.textContent
    button.disabled = true
    button.textContent = "Agregando…"

    try {
      if (error) error.hidden = true
      await tiendu.cart.addProductVariant(
        variant,
        quantity,
        (result) => updateCartQuantity(result.updatedCartItemsQuantity),
        {
          title: button.dataset.productTitle || "",
          currency: button.dataset.productCurrency || storeCurrency,
        }
      )
    } catch {
      if (error) {
        error.textContent = "No se pudo agregar el producto. Intentá nuevamente."
        error.hidden = false
      }
    } finally {
      button.disabled = false
      button.textContent = originalText
    }
  })

  syncCartQuantity()
}

function updateWishlistQuantity(quantity) {
  const value = Math.max(0, Number(quantity) || 0)
  for (const badge of document.querySelectorAll("[data-wishlist-quantity]")) {
    badge.textContent = String(value)
    badge.hidden = value <= 0
    badge.classList.toggle("is-visible", value > 0)
    badge.classList.remove("is-hiding")
    badge.dataset.displayedQuantity = String(value)
  }
}

function syncWishlistHearts(productIds) {
  const saved = new Set((Array.isArray(productIds) ? productIds : []).map(Number))
  for (const button of document.querySelectorAll("[data-action='toggle-wishlist']")) {
    const productId = Number(button.dataset.productId)
    const pressed = saved.has(productId)
    button.setAttribute("aria-pressed", String(pressed))
    button.setAttribute("aria-label", pressed ? "Quitar de favoritos" : "Guardar en favoritos")
  }
}

async function syncShopperStatus() {
  try {
    const status = await tiendu.shopper.getStatus()
    updateWishlistQuantity(status.wishlistCount)
    syncWishlistHearts(status.wishlistProductIds)
    return status
  } catch {
    updateWishlistQuantity(0)
    syncWishlistHearts([])
    return { shopper: null, wishlistCount: 0, wishlistProductIds: [] }
  }
}

function initWishlist() {
  document.addEventListener("click", async (event) => {
    const accountButton = event.target.closest('[data-action="open-account"]')
    if (accountButton) {
      event.preventDefault()
      await openStoreOverlay(accountButton, () => tiendu.shopper.open({ mode: "sign-in" }))
      return
    }

    const wishlistButton = event.target.closest('[data-action="open-wishlist"]')
    if (wishlistButton) {
      event.preventDefault()
      await openStoreOverlay(wishlistButton, () => tiendu.wishlist.open())
      return
    }

    const heart = event.target.closest('[data-action="toggle-wishlist"]')
    if (!heart) return
    event.preventDefault()
    const productId = Number(heart.dataset.productId)
    if (!Number.isFinite(productId) || productId <= 0) return

    heart.disabled = true
    try {
      const status = await tiendu.shopper.getStatus()
      if (!status.shopper) {
        await openStoreOverlay(heart, () => tiendu.shopper.open({ mode: "sign-up", productId }))
        return
      }
      const result = await tiendu.wishlist.toggle(productId)
      const pressed = Boolean(result?.saved)
      heart.setAttribute("aria-pressed", String(pressed))
      heart.setAttribute("aria-label", pressed ? "Quitar de favoritos" : "Guardar en favoritos")
      if (typeof result?.count === "number") updateWishlistQuantity(result.count)
      else await syncShopperStatus()
    } catch {
      await syncShopperStatus()
    } finally {
      heart.disabled = false
    }
  })

  window.addEventListener("tiendu:shopper-status", () => {
    void syncShopperStatus()
  })

  syncShopperStatus()
}

function initNewsletter() {
  for (const form of document.querySelectorAll("[data-newsletter-form]")) {
    if (!(form instanceof HTMLFormElement)) continue
    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      const input = form.querySelector("[data-newsletter-email]")
      const error = form.querySelector("[data-newsletter-error]")
      const button = form.querySelector('button[type="submit"]')
      if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return

      const email = input.value.trim()
      if (!input.checkValidity() || !email) {
        if (error) {
          error.textContent = "Ingresá un email válido."
          error.hidden = false
        }
        return
      }

      error?.setAttribute("hidden", "")
      button.disabled = true
      const originalText = button.textContent
      button.textContent = "Enviando…"

      try {
        await tiendu.subscribers.add(email)
        input.value = ""
        const dialog = form.nextElementSibling
        if (dialog instanceof HTMLDialogElement) dialog.showModal()
      } catch {
        if (error) {
          error.textContent = "No se pudo completar la suscripción. Intentá nuevamente."
          error.hidden = false
        }
      } finally {
        button.disabled = false
        button.textContent = originalText
      }
    })
  }
}

function initActions() {
  for (const select of document.querySelectorAll("[data-auto-submit]")) {
    select.addEventListener("change", () => select.form?.requestSubmit())
  }

  document.addEventListener("click", async (event) => {
    const searchButton = event.target.closest('[data-action="open-search"]')
    if (searchButton) {
      event.preventDefault()
      const form = searchButton.closest("[data-search-trigger]")
      const input = form?.querySelector('input[name="q"]')
      const query = searchButton.dataset.searchQuery || input?.value || ""
      await openStoreOverlay(searchButton, () => tiendu.search.open({ query }))
      return
    }

    const button = event.target.closest('[data-action="share"]')
    if (!button) return
    const data = { title: button.dataset.shareTitle || document.title, url: window.location.href }
    if (navigator.share) await navigator.share(data).catch(() => {})
    else await navigator.clipboard?.writeText(data.url).catch(() => {})
  })

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-search-trigger]")
    if (!(form instanceof HTMLFormElement)) return
    event.preventDefault()
    const input = form.querySelector('input[name="q"]')
    await openStoreOverlay(form.querySelector('[data-action="open-search"]') || form, () =>
      tiendu.search.open({ query: input?.value || "" })
    )
  })
}

function initHeader() {
  const header = document.querySelector("[data-site-header]")
  const drawer = document.querySelector("[data-nav-drawer]")
  if (!(header instanceof HTMLElement) || !(drawer instanceof HTMLElement)) return

  const overlay = drawer.querySelector("[data-drawer-overlay]")
  const openIcon = header.querySelector("[data-icon-open]")
  const closeIcon = header.querySelector("[data-icon-close]")
  const toggles = document.querySelectorAll("[data-action='toggle-menu']")
  let closeTimer = 0

  const setOpen = (open) => {
    window.clearTimeout(closeTimer)
    if (open) {
      drawer.classList.remove("is-closing")
      drawer.classList.add("is-open")
    } else if (drawer.classList.contains("is-open")) {
      drawer.classList.add("is-closing")
      drawer.classList.remove("is-open")
      closeTimer = window.setTimeout(() => drawer.classList.remove("is-closing"), 400)
    }
    header.classList.toggle("is-open", open)
    document.body.classList.toggle("nav-open", open)
    drawer.setAttribute("aria-hidden", String(!open))
    toggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", String(open))
      if (toggle.classList.contains("site-header__menu-button")) {
        toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú")
      }
    })
    if (openIcon instanceof HTMLElement) openIcon.hidden = open
    if (closeIcon instanceof HTMLElement) closeIcon.hidden = !open
  }

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => setOpen(!drawer.classList.contains("is-open")))
  })
  overlay?.addEventListener("click", () => setOpen(false))
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false)
  })
  drawer.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false))
  })
  drawer.querySelectorAll('[data-action="open-account"], [data-action="open-wishlist"]').forEach((button) => {
    button.addEventListener("click", () => setOpen(false))
  })

  const desktopQuery = window.matchMedia("(min-width: 880px)")
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) setOpen(false)
  })
}

/* Reveal sections marked with data-animate-in. Distance and delay live in theme.css. */
function initSectionReveal() {
  if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return

  const targets = [...document.querySelectorAll("[data-animate-in]")].filter(
    (element) => element instanceof HTMLElement,
  )
  if (targets.length === 0) return

  document.documentElement.classList.add("js-reveal")

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("is-inview")
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0, rootMargin: "0px 0px -38% 0px" },
  )

  for (const element of targets) observer.observe(element)
}

document.addEventListener("DOMContentLoaded", () => {
  initHeader()
  initCart()
  initWishlist()
  initNewsletter()
  initActions()
  initSectionReveal()
  const product = document.querySelector('[data-product-root]')
  const contact = document.querySelector('[data-whatsapp-contact]')
  if (product && contact) {
    const url = new URL(contact.href)
    url.searchParams.set('text', `¡Hola! Tengo una pregunta sobre "${product.dataset.analyticsProductTitle}" que vi en su tienda online.`)
    contact.href = url.href
  }
})
