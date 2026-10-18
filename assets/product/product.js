import { createMediaCarousel, hydrateProductVideo, bindMediaLightbox } from "media-carousel"

const tiendu = window.Tiendu()
const storeCurrency = document.body?.dataset.storeCurrency || "UYU"

const TAP_SLOP_PX = 10

function normalizeCurrency(currency) {
  return typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : storeCurrency
}

function formatMoney(cents, currency = storeCurrency) {
  const value = Number(cents)
  if (!Number.isFinite(value)) return ""
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: normalizeCurrency(currency) }).format(value / 100)
}

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

function selectedVariant(form, button) {
  const select = form.querySelector("[data-variant-select]")
  const option = select instanceof HTMLSelectElement ? select.selectedOptions[0] : null
  const id = Number(option?.value || button.dataset.variantId)
  if (!Number.isFinite(id) || id <= 0) return null

  const price = Number(option?.dataset.priceInCents || button.dataset.priceInCents)
  return Number.isFinite(price) ? { id, priceInCents: price } : { id }
}

function attributeInputs(form) {
  return [...form.querySelectorAll("[data-attribute-input]")]
}

function selectedAttributeValues(form) {
  const selected = new Map()
  for (const input of attributeInputs(form)) {
    const attributeId = input.dataset.attributeId
    if (!attributeId) continue
    const valueId = input instanceof HTMLSelectElement
      ? input.selectedOptions[0]?.dataset.valueId || input.value
      : input instanceof HTMLInputElement && input.checked ? input.dataset.valueId || input.value : null
    if (valueId) selected.set(attributeId, valueId)
  }
  return selected
}

function updateAttributePreview(form) {
  for (const group of form.querySelectorAll("[data-attribute-group]")) {
    const input = group.querySelector("select[data-attribute-input]")
      || group.querySelector("input[data-attribute-input]:checked")
    const preview = group.querySelector("[data-attribute-preview]")
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || !(preview instanceof HTMLElement)) continue

    const value = input instanceof HTMLSelectElement ? input.selectedOptions[0] : input
    const label = preview.querySelector("[data-attribute-preview-label]")
    const swatch = preview.querySelector("[data-attribute-preview-swatch]")
    const image = preview.querySelector("[data-attribute-preview-image]")
    const color = value?.dataset.valueColor || ""
    const imageUrl = value?.dataset.valueImageUrl || ""
    if (label) label.textContent = value?.dataset.valueLabel || value?.textContent?.trim() || ""
    if (swatch instanceof HTMLElement) {
      swatch.hidden = !color
      swatch.style.backgroundColor = color
    }
    if (image instanceof HTMLImageElement) {
      image.hidden = !imageUrl
      if (imageUrl) image.src = imageUrl
    }
  }
}

function markVariantUnavailable(form) {
  const button = form.querySelector('[data-action="add-to-cart"]')
  const productRoot = form.closest("[data-product-root]")
  if (button instanceof HTMLButtonElement) {
    button.disabled = true
    button.textContent = "Combinación no disponible"
  }
  const stockNode = productRoot?.querySelector("[data-product-stock]")
  if (stockNode) stockNode.textContent = "Combinación no disponible"
}

function syncAttributeSelection(form, galleryController) {
  const select = form.querySelector("[data-variant-select]")
  const inputs = attributeInputs(form)
  if (!(select instanceof HTMLSelectElement) || inputs.length === 0) return false

  updateAttributePreview(form)
  const currentValues = selectedAttributeValues(form)
  for (const input of inputs) {
    const choices = input instanceof HTMLSelectElement ? [...input.options] : [input]
    for (const choice of choices) {
      const attributeId = input.dataset.attributeId
      const valueId = choice.dataset.valueId || choice.value
      choice.disabled = ![...select.options].some(candidate => {
        if (candidate.disabled) return false
        const values = new Map((candidate.dataset.attributeValueMap || '').split(';').filter(Boolean).map(pair => pair.split(':')))
        if (values.get(attributeId) !== valueId) return false
        return [...currentValues].every(([name, value]) => name === attributeId || values.get(name) === value)
      })
    }
  }
  const selectedValues = selectedAttributeValues(form)
  const attributeCount = form.querySelectorAll("[data-attribute-group]").length
  if (selectedValues.size !== attributeCount) {
    markVariantUnavailable(form)
    return true
  }

  const option = [...select.options].find((candidate) => {
    const candidateValues = new Map(
      (candidate.dataset.attributeValueMap || "")
        .split(";")
        .filter(Boolean)
        .map((pair) => pair.split(":"))
        .filter(([attributeId, valueId]) => attributeId && valueId)
    )
    if (candidateValues.size !== selectedValues.size) return false
    return [...selectedValues].every(([attributeId, valueId]) => candidateValues.get(attributeId) === valueId)
  })
  if (!(option instanceof HTMLOptionElement)) {
    markVariantUnavailable(form)
    return true
  }

  select.value = option.value
  syncVariantForm(form, galleryController)
  return true
}

function initGallery(productRoot) {
  const carouselRoot = productRoot.querySelector("[data-media-carousel]")
  if (carouselRoot instanceof HTMLElement) {
    const carousel = createMediaCarousel(carouselRoot)
    return {
      renderVariantImage(option) {
        const imageId = option?.dataset.coverImageId || ""
        if (imageId) carousel.goToImageId(imageId)
      },
    }
  }

  hydrateProductVideo(productRoot)

  const soleRoot = productRoot.querySelector("[data-media-lightbox-root]")
  const soleImage = productRoot.querySelector(".product-media__image")
  if (!(soleImage instanceof HTMLImageElement)) return null

  if (soleRoot instanceof HTMLElement) {
    const lightbox = bindMediaLightbox(soleRoot, () => soleImage)
    let tapStartX = 0
    let tapStartY = 0
    soleRoot.addEventListener("pointerdown", (event) => {
      tapStartX = event.clientX
      tapStartY = event.clientY
    })
    soleRoot.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return
      if (Math.hypot(event.clientX - tapStartX, event.clientY - tapStartY) > TAP_SLOP_PX) return
      lightbox.open?.()
    })
  }

  return {
    renderVariantImage(option) {
      const imageUrl = option?.dataset.coverImageUrl || ""
      const imageAlt = option?.dataset.coverImageAlt || ""
      const imageId = option?.dataset.coverImageId || ""
      if (!imageUrl) return
      soleImage.src = imageUrl
      if (imageAlt) soleImage.alt = imageAlt
      if (imageId) soleImage.dataset.imageId = imageId
    },
  }
}

function syncVariantForm(form, galleryController) {
  const select = form.querySelector("[data-variant-select]")
  if (!(select instanceof HTMLSelectElement)) return

  const option = select.selectedOptions[0]
  const button = form.querySelector('[data-action="add-to-cart"]')
  const quantity = form.querySelector('input[name="quantity"]')
  const productRoot = form.closest("[data-product-root]")
  if (!(option instanceof HTMLOptionElement) || !(button instanceof HTMLButtonElement)) return

  galleryController?.renderVariantImage(option)

  const stock = option.dataset.stock === "" ? null : Number(option.dataset.stock)
  const price = option.dataset.priceInCents
  const compareAt = option.dataset.compareAtPriceInCents

  button.dataset.variantId = option.value
  button.dataset.priceInCents = price || ""
  button.disabled = option.disabled || stock === 0
  button.textContent = button.disabled ? "Agotado" : "Agregar al carrito"

  if (quantity instanceof HTMLInputElement) {
    if (Number.isFinite(stock) && stock >= 0) quantity.max = String(stock)
    else quantity.removeAttribute("max")
    quantity.value = String(Math.max(1, Math.min(Number(quantity.value) || 1, stock ?? Infinity)))
  }

  const productCurrency = productRoot?.dataset.productCurrency || button.dataset.productCurrency || storeCurrency
  const priceNode = productRoot?.querySelector("[data-product-price]")
  const compareNode = productRoot?.querySelector("[data-product-compare-price]")
  if (priceNode && price) priceNode.textContent = formatMoney(price, productCurrency)
  if (compareNode instanceof HTMLElement) {
    const showCompare = Number(compareAt) > Number(price)
    compareNode.hidden = !showCompare
    if (showCompare) compareNode.textContent = formatMoney(compareAt, productCurrency)
  }

  const stockNode = productRoot?.querySelector("[data-product-stock]")
  if (stockNode) {
    stockNode.textContent = stock === 0 ? "Sin stock" : Number.isFinite(stock) ? `${stock} disponibles` : "Disponible"
  }
}

function initProduct() {
  const productRoot = document.querySelector("[data-product-root]")
  if (!(productRoot instanceof HTMLElement)) return

  const galleryController = initGallery(productRoot)

  document.addEventListener("change", (event) => {
    const attributeInput = event.target.closest("[data-attribute-input]")
    const attributeForm = attributeInput?.closest("[data-product-form]")
    if (attributeForm instanceof HTMLFormElement) {
      syncAttributeSelection(attributeForm, galleryController)
      return
    }
    const select = event.target.closest("[data-variant-select]")
    const form = select?.closest("[data-product-form]")
    if (form instanceof HTMLFormElement) syncVariantForm(form, galleryController)
  })

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-product-form]")
    if (!(form instanceof HTMLFormElement) || !form.closest("[data-product-root]")) return
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
      const cart = await tiendu.cart.add(variant, quantity, {
        title: button.dataset.productTitle || "",
        currency: button.dataset.productCurrency || productRoot.dataset.productCurrency || storeCurrency,
      })
      updateCartQuantity(cart.quantity)
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

  const button = productRoot.querySelector('[data-action="add-to-cart"]')
  const variantId = Number(productRoot.dataset.analyticsVariantId || button?.dataset.variantId)
  if (!Number.isFinite(variantId) || variantId <= 0) return

  const priceInCents = Number(productRoot.dataset.analyticsPriceInCents || button?.dataset.priceInCents)
  const variant = Number.isFinite(priceInCents) ? { id: variantId, priceInCents } : { id: variantId }
  tiendu.track("view_item", {
    product: {
      title: productRoot.dataset.analyticsProductTitle || button?.dataset.productTitle || "",
      currency: productRoot.dataset.productCurrency || storeCurrency,
      ...(Number.isFinite(priceInCents) ? { basePriceInCents: priceInCents } : {})
    },
    variant,
  })

  for (const form of productRoot.querySelectorAll("[data-product-form]")) {
    if (!syncAttributeSelection(form, galleryController)) syncVariantForm(form, galleryController)
  }
}

document.addEventListener("DOMContentLoaded", initProduct)
