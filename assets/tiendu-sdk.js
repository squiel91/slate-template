/*! tiendu-sdk 1.0.0 */
let activeOverlayCleanup = null
let didAutoOpenCoupon = false

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
const isRecord = (value) => typeof value === 'object' && value !== null

const ANALYTICS_META_EVENTS_URL = '/api/analytics/meta-events'
const PRODUCT_VARIANT_ID_PREFIX = 'TIENDU_PRODUCT_VARIANT_ID_'

/**
 * Product image returned by the storefront API.
 *
 * @typedef {Object} TienduImage
 * @property {number|null} id
 * @property {string} url
 * @property {string} alt
 */

/**
 * Product variant returned by the storefront API.
 * Stock is null for an unlimited-inventory variant.
 *
 * @typedef {Object} TienduProductVariant
 * @property {number} id
 * @property {number} productId
 * @property {number|null} priceInCents
 * @property {number|null} weightInGrams
 * @property {number|null} compareAtPriceInCents
 * @property {number|null} stock
 * @property {string|null} sku
 * @property {TienduImage|null} coverImage
 * @property {Array<Object>} attributes
 * @property {boolean} isListed
 */

/**
 * Product DTO returned by products.list(), products.get(), and related-product
 * endpoints. Prefer minPriceInCents/maxPriceInCents for cards and use currency
 * when formatting prices in browser code.
 *
 * @typedef {Object} TienduProduct
 * @property {number} id
 * @property {string} title
 * @property {string} handle
 * @property {string} currency ISO 4217 product currency, currently UYU or USD
 * @property {TienduImage|null} coverImage
 * @property {TienduImage[]|null} images
 * @property {number|null} basePriceInCents
 * @property {number|null} minPriceInCents Lowest listed variant price
 * @property {number|null} maxPriceInCents Highest listed variant price
 * @property {number|null} compareAtPriceInCents Shared listed-variant compare-at price
 * @property {number|null} baseCompareAtPriceInCents
 * @property {number|null} baseWeightInGrams
 * @property {string|null} description
 * @property {{title: string|null, description: string|null}} seo
 * @property {Array<Object>|null} specifications
 * @property {*} metadata
 * @property {string|null} videoUrl
 * @property {boolean} isPhysical
 * @property {boolean} isListed
 * @property {boolean} inStock True when a variant has stock or unlimited stock
 * @property {number|null} averageRating
 * @property {number} reviewsQuantity
 * @property {TienduProductVariant[]} variants
 * @property {Array<Object>} attributes
 * @property {string} url
 * @property {string} publicUrl
 * @property {number} unitsSold
 * @property {string|null} templateSuffix
 * @property {string|Date} updatedAt
 * @property {string|Date} createdAt
 */

const getCurrency = (preferredCurrency) => {
  if (typeof document === 'undefined' && typeof preferredCurrency !== 'string') return 'UYU'
  const currency = preferredCurrency ?? document.body?.dataset?.storeCurrency
  return typeof currency === 'string' && currency.trim()
    ? currency.trim().toUpperCase()
    : 'UYU'
}

const generateEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const readCookie = (name) => {
  if (typeof document === 'undefined' || !document.cookie) return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

const postBeacon = (url, body) => {
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {})
  } catch {
    // ignore
  }
}

const sendMetaCAPI = (eventName, eventId, customData) => {
  postBeacon(ANALYTICS_META_EVENTS_URL, {
    eventName,
    eventId,
    eventSourceUrl: window.location.href,
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    ...(customData ? { customData } : {}),
  })
}

const fireFbq = (eventName, fbqData, eventId) => {
  if (typeof window.fbq !== 'function') return
  window.fbq('track', eventName, fbqData, { eventID: eventId })
}

const fireGtag = (eventName, ga4Data) => {
  if (typeof window.gtag !== 'function') return
  window.gtag('event', eventName, ga4Data)
}

const variantContentId = (variantId) => `${PRODUCT_VARIANT_ID_PREFIX}${variantId}`

const trackViewContent = (product, variant) => {
  if (!variant || typeof variant.id !== 'number') return
  const eventId = generateEventId()
  const priceCents =
    typeof variant.priceInCents === 'number'
      ? variant.priceInCents
      : typeof product?.basePriceInCents === 'number'
        ? product.basePriceInCents
        : 0
  const value = priceCents / 100
  const contentId = variantContentId(variant.id)
  const currency = getCurrency(product?.currency)

  const fbqData = {
    content_ids: [contentId],
    content_name: product?.title ?? '',
    content_type: 'product',
    value,
    currency,
  }
  fireFbq('ViewContent', fbqData, eventId)
  sendMetaCAPI('ViewContent', eventId, fbqData)

  const ga4Data = {
    currency,
    value,
    items: [
      {
        item_id: contentId,
        item_name: product?.title ?? '',
        price: value,
        quantity: 1,
      },
    ],
  }
  fireGtag('view_item', ga4Data)
}

const trackAddToCart = (variant, quantity, product) => {
  if (!variant || typeof variant.id !== 'number') return
  const eventId = generateEventId()
  const priceCents =
    typeof variant.priceInCents === 'number'
      ? variant.priceInCents
      : typeof product?.basePriceInCents === 'number'
        ? product.basePriceInCents
        : 0
  const unitPrice = priceCents / 100
  const value = (priceCents * quantity) / 100
  const contentId = variantContentId(variant.id)
  const productTitle = product?.title ?? variant?.productTitle ?? ''
  const currency = getCurrency(product?.currency)

  const fbqData = {
    content_ids: [contentId],
    ...(productTitle ? { content_name: productTitle } : {}),
    content_type: 'product',
    value,
    currency,
    contents: [{ id: contentId, quantity }],
  }
  fireFbq('AddToCart', fbqData, eventId)
  sendMetaCAPI('AddToCart', eventId, fbqData)

  const ga4Data = {
    currency,
    value,
    items: [
      {
        item_id: contentId,
        ...(productTitle ? { item_name: productTitle } : {}),
        price: unitPrice,
        quantity,
      },
    ],
  }
  fireGtag('add_to_cart', ga4Data)
}

const trackSearch = (query) => {
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed) return
  const eventId = generateEventId()

  const fbqData = { search_string: trimmed }
  fireFbq('Search', fbqData, eventId)
  sendMetaCAPI('Search', eventId, fbqData)

  fireGtag('search', { search_term: trimmed })
}

const buildCheckoutContents = (items) => {
  if (!Array.isArray(items)) return []
  const result = []
  for (const item of items) {
    const variantId = Number(item?.productVariantId)
    const quantity = Number(item?.quantity)
    if (!Number.isFinite(variantId) || !Number.isFinite(quantity)) continue
    result.push({ id: variantContentId(variantId), quantity })
  }
  return result
}

const trackInitiateCheckout = (totalPriceInCents, items) => {
  const eventId = generateEventId()
  const value = (Number(totalPriceInCents) || 0) / 100
  const contents = buildCheckoutContents(items)
  const numItems = contents.reduce((acc, item) => acc + item.quantity, 0)

  const fbqData = {
    content_type: 'product',
    value,
    currency: getCurrency(),
    contents,
    num_items: numItems,
  }
  fireFbq('InitiateCheckout', fbqData, eventId)
  sendMetaCAPI('InitiateCheckout', eventId, fbqData)

  const ga4Data = {
    currency: getCurrency(),
    value,
    items: contents.map((entry) => ({ item_id: entry.id, quantity: entry.quantity })),
  }
  fireGtag('begin_checkout', ga4Data)
}

const trackPurchase = (totalPriceInCents, items, orderId) => {
  const eventId = generateEventId()
  const value = (Number(totalPriceInCents) || 0) / 100
  const contents = buildCheckoutContents(items)
  const numItems = contents.reduce((acc, item) => acc + item.quantity, 0)

  const fbqData = {
    content_type: 'product',
    value,
    currency: getCurrency(),
    contents,
    num_items: numItems,
    ...(orderId ? { order_id: orderId } : {}),
  }
  fireFbq('Purchase', fbqData, eventId)
  sendMetaCAPI('Purchase', eventId, fbqData)

  const ga4Data = {
    currency: getCurrency(),
    value,
    ...(orderId ? { transaction_id: orderId } : {}),
    items: contents.map((entry) => ({ item_id: entry.id, quantity: entry.quantity })),
  }
  fireGtag('purchase', ga4Data)
}

const buildUrl = (url, queryParams) => {
  if (!queryParams) return url

  const resolved = new URL(url, window.location.origin)

  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue
        resolved.searchParams.append(key, String(item))
      }

      continue
    }

    resolved.searchParams.set(key, String(value))
  }

  return resolved.toString()
}

const createRequester = (baseFetch) => {
  const request = async (url, options = {}) => {
    const { queryParams, ...fetchOptions } = options
    const finalUrl = buildUrl(url, queryParams)
    const response = await baseFetch(finalUrl, fetchOptions)

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return await response.json()
  }

  return {
    get: (url, options = {}) => request(url, { ...options, method: 'GET' }),
    post: (url, body, options = {}) => {
      const headers = new Headers(options.headers)
      headers.set('Content-Type', 'application/json')

      return request(url, {
        ...options,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    },
  }
}

const unwrapData = (response) => {
  if (isRecord(response) && 'data' in response) {
    return response.data ?? response
  }

  return response
}

const waitForCartSync = async (getQuantity, previousQuantity) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const { quantity } = await getQuantity()
      if (quantity > previousQuantity) return
    } catch {
      // ignore transient sync errors
    }

    await wait(60)
  }
}

const checkoutStepOrder = Object.freeze({
  cart: 0,
  delivery: 1,
  contact: 2,
  summary: 3,
  'payment-options': 4,
  payment: 5,
  success: 6,
  coupon: 100,
})

const isCheckoutHistoryState = (state) => {
  return state?.tienduOverlay === 'checkout'
    && typeof state.checkoutStep === 'string'
    && Number.isInteger(state.checkoutHistoryIndex)
    && Object.prototype.hasOwnProperty.call(checkoutStepOrder, state.checkoutStep)
}

export const Tiendu = () => {
  const requester = createRequester(fetch)
  const baseApiUrl = '/tiendu/api'

  const openOverlayIframe = async ({ src, onMessage, waitForReady = false }) => {
    if (typeof activeOverlayCleanup === 'function') {
      activeOverlayCleanup()
      activeOverlayCleanup = null
    }

    const iframe = document.createElement('iframe')
    iframe.src = src
    iframe.id = 'left-iframe'

    let isClosed = false
    let hasSettled = false
    let resolveOpen = null
    let rejectOpen = null
    const isCheckoutOverlay = src.startsWith('/tiendu/checkout')
    let checkoutStep = isCheckoutOverlay ? 'cart' : null
    let checkoutHistoryIndex = 0
    let pendingCheckoutHistoryStep = null
    let checkoutHistoryRestoreDelta = 0

    const isTrustedIframeMessage = (event) => {
      if (event.origin !== window.location.origin) return false

      return iframe.contentWindow !== null && event.source === iframe.contentWindow
    }

    const settleReject = (error) => {
      if (hasSettled) return
      hasSettled = true
      resolveOpen = null
      rejectOpen?.(error)
      rejectOpen = null
    }

    const settleResolve = () => {
      if (hasSettled) return
      hasSettled = true
      resolveOpen?.(iframe)
      resolveOpen = null
      rejectOpen = null
    }

    let isPopStateClose = false

    const handlePopState = (event) => {
      if (isCheckoutOverlay) {
        if (checkoutStep === 'success') {
          isPopStateClose = true
          const targetIndex = isCheckoutHistoryState(event.state)
            ? event.state.checkoutHistoryIndex
            : -1
          checkoutHistoryRestoreDelta = targetIndex >= 0 ? targetIndex + 1 : 0
          iframe.contentWindow?.postMessage({ type: 'close' }, window.location.origin)
          return
        }

        if (isCheckoutHistoryState(event.state)) {
          checkoutHistoryIndex = event.state.checkoutHistoryIndex
          checkoutStep = event.state.checkoutStep
          pendingCheckoutHistoryStep = checkoutStep
          iframe.contentWindow?.postMessage(
            {
              type: 'checkout-history-navigation',
              step: checkoutStep,
            },
            window.location.origin,
          )
          return
        }
      }

      isPopStateClose = true
      iframe.contentWindow?.postMessage({ type: 'close' }, window.location.origin)
    }

    const cleanup = () => {
      if (isClosed) return
      isClosed = true
      window.removeEventListener('message', handleIframeMessage)
      window.removeEventListener('popstate', handlePopState)
      iframe.onload = null
      iframe.onerror = null
      iframe.remove()

      if (activeOverlayCleanup === cleanup) {
        activeOverlayCleanup = null
      }

      if (!isPopStateClose) {
        if (isCheckoutOverlay) {
          history.go(-(checkoutHistoryIndex + 1))
        } else {
          history.back()
        }
      } else if (isCheckoutOverlay && checkoutHistoryRestoreDelta > 0) {
        history.go(-checkoutHistoryRestoreDelta)
      }

      if (waitForReady) {
        settleReject(new Error('Overlay closed before it became ready'))
      }
    }

    activeOverlayCleanup = cleanup
    window.addEventListener('popstate', handlePopState)
    history.pushState(
      isCheckoutOverlay
        ? {
            ...history.state,
            tienduOverlay: 'checkout',
            checkoutStep: 'cart',
            checkoutHistoryIndex: 0,
          }
        : { ...history.state, searchOverlay: true },
      '',
      window.location.href,
    )

    const handleIframeMessage = (event) => {
      if (!isTrustedIframeMessage(event)) return

      const message = event.data

      if (isCheckoutOverlay && message?.type === 'checkout-history-back') {
        history.back()
        return
      }

      if (
        isCheckoutOverlay
        && message?.type === 'step-changed'
        && typeof message.step === 'string'
        && Object.prototype.hasOwnProperty.call(checkoutStepOrder, message.step)
      ) {
        const isHistoryNavigation = pendingCheckoutHistoryStep === message.step
        const isInitialStep = checkoutHistoryIndex === 0
          && checkoutStep === 'cart'
          && message.step === 'cart'
        const shouldReplace = isHistoryNavigation
          || isInitialStep
          || message.historyAction === 'replace'
          || message.historyAction === 'none'
        const nextHistoryIndex = shouldReplace
          ? checkoutHistoryIndex
          : checkoutHistoryIndex + 1
        const nextHistoryState = {
          ...history.state,
          tienduOverlay: 'checkout',
          checkoutStep: message.step,
          checkoutHistoryIndex: nextHistoryIndex,
        }

        if (shouldReplace) {
          history.replaceState(nextHistoryState, '', window.location.href)
        } else {
          history.pushState(nextHistoryState, '', window.location.href)
        }

        checkoutStep = message.step
        checkoutHistoryIndex = nextHistoryIndex
        if (isHistoryNavigation) pendingCheckoutHistoryStep = null
      }

      onMessage?.(message)

      if (message?.type === 'ready' && waitForReady && !hasSettled) {
        settleResolve()
      }

      if (message?.type === 'close') {
        cleanup()
      }
    }

    return await new Promise((resolve, reject) => {
      resolveOpen = resolve
      rejectOpen = reject
      window.addEventListener('message', handleIframeMessage)

      iframe.onerror = () => {
        cleanup()
        settleReject(new Error('Failed to load overlay iframe'))
      }

      iframe.style.position = 'fixed'
      iframe.style.top = '0'
      iframe.style.left = '0'
      iframe.style.width = '100%'
      iframe.style.height = '100%'
      iframe.style.zIndex = '9999'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)

      if (!waitForReady) {
        settleResolve()
      }
    })
  }

  const methods = {
    products: {
      /**
       * List products.
       *
       * @param {Object} [options]
       * @param {number} [options.page]
       * @param {number} [options.size]
       * @param {string} [options.q]
       * @param {string} [options.search] Backward-compatible alias for q.
       * @param {string} [options.criteria]
       * @param {string} [options.order]
       * @param {string} [options.sort_by]
       * @param {number} [options.categoryId]
       * @param {number|string|number[]} [options.id]
       * @param {number|string|number[]} [options.ids]
       * @param {string} [options.sortBy] Backward-compatible alias for sort_by.
       * @param {boolean} [options.includeProductsFromSubcategories]
       * @param {boolean} [options.inStock] - `true` returns products with at least one variant in stock. `false` returns products where all variants are out of stock. Omit to return all products.
       * @returns {Promise<{data: TienduProduct[], pagination?: Object}>}
       */
      list: async (options = {}) => {
        const queryParams = {}
        for (const key of ['page', 'size', 'categoryId', 'inStock', 'criteria', 'order', 'sort_by', 'includeProductsFromSubcategories']) {
          if (options[key] !== undefined) queryParams[key] = options[key]
        }
        if (options.q !== undefined || options.search !== undefined) queryParams.q = options.q ?? options.search
        if (options.id !== undefined || options.ids !== undefined) queryParams.id = options.id ?? options.ids
        if (options.sortBy !== undefined && queryParams.sort_by === undefined) queryParams.sort_by = options.sortBy
        return await requester.get(`${baseApiUrl}/products`, { queryParams })
      },
      /**
       * Fetch one product by id.
       *
       * @param {number|string} productId Product id to fetch.
       * @returns {Promise<TienduProduct>} The product.
       */
      get: async (productId) => unwrapData(await requester.get(`${baseApiUrl}/products/${productId}`)),
      /**
       * Fetch products related to one product.
       *
       * @param {number|string} productId Product id used to find related products.
       * @returns {Promise<TienduProduct[]>} The related products.
       */
      getRelated: async (productId) => unwrapData(await requester.get(`${baseApiUrl}/products/${productId}/related`)),
    },
    reviews: {
      /**
       * List product reviews.
       *
       * @param {Object} [options] Filter and pagination options.
       * @returns {Promise<*>} The reviews response.
       */
      list: async (options = {}) => await requester.get(`${baseApiUrl}/reviews`, { queryParams: options }),
    },
    collections: {
      /**
       * List collections.
       *
       * @returns {Promise<*>} The collections.
       */
      list: async () => unwrapData(await requester.get(`${baseApiUrl}/categories`)),
      /**
       * Fetch one collection by id.
       *
       * @param {number|string} collectionId Collection id to fetch.
       * @returns {Promise<*>} The collection.
       */
      get: async (collectionId) => unwrapData(await requester.get(`${baseApiUrl}/categories/${collectionId}`)),
    },
    subscribers: {
      /**
       * Subscribe an email to the newsletter.
       *
       * @param {string} email Email address to subscribe.
       * @returns {Promise<*>} The created subscriber.
       */
      add: async (email) => unwrapData(await requester.post(`${baseApiUrl}/subscribers`, { email })),
    },
    images: {
      /**
       * Fetch one image by id.
       *
       * @param {number|string} imageId Image id to fetch.
       * @returns {Promise<*>} The image.
       */
      get: async (imageId) => unwrapData(await requester.get(`${baseApiUrl}/images/${imageId}`)),
    },
    pages: {
      /**
       * List store pages.
       *
       * @returns {Promise<*>} The pages.
       */
      list: async () => unwrapData(await requester.get(`${baseApiUrl}/pages`)),
      /**
       * Fetch one page by id.
       *
       * @param {number|string} pageId Page id to fetch.
       * @returns {Promise<*>} The page.
       */
      get: async (pageId) => unwrapData(await requester.get(`${baseApiUrl}/pages/${pageId}`)),
    },
    blogPosts: {
      /**
       * List blog posts.
       *
       * @returns {Promise<*>} The blog posts.
       */
      list: async () => unwrapData(await requester.get(`${baseApiUrl}/blog-posts`)),
      /**
       * Fetch one blog post by id.
       *
       * @param {number|string} blogPostId Blog post id to fetch.
       * @returns {Promise<*>} The blog post.
       */
      get: async (blogPostId) => unwrapData(await requester.get(`${baseApiUrl}/blog-posts/${blogPostId}`)),
    },
    analytics: {
      /**
       * Record a page view.
       *
       * @returns {void} Nothing.
       */
      trackPageView: () => {},
      /**
       * Track a product detail view.
       *
       * @param {TienduProduct} product Product that was viewed.
       * @param {TienduProductVariant} variant Variant that was viewed.
       * @returns {void} Nothing.
       */
      trackViewContent,
      /**
       * Track a search.
       *
       * @param {string} query Search text that was submitted.
       * @returns {void} Nothing.
       */
      trackSearch,
      /**
       * Track an add to cart.
       *
       * @param {TienduProductVariant} variant Variant added to the cart.
       * @param {number} quantity Quantity added.
       * @param {TienduProduct} [product] Product that owns the variant.
       * @returns {void} Nothing.
       */
      trackAddToCart,
      /**
       * Track the start of checkout.
       *
       * @param {number} totalPriceInCents Cart total in cents.
       * @param {Array<Object>} items Cart items.
       * @returns {void} Nothing.
       */
      trackInitiateCheckout,
      /**
       * Track a completed purchase.
       *
       * @param {number} totalPriceInCents Order total in cents.
       * @param {Array<Object>} items Order items.
       * @param {number|string} [orderId] Order id.
       * @returns {void} Nothing.
       */
      trackPurchase,
    },
    search: {
      /**
       * Open the search overlay.
       *
       * @param {Object} [options] Overlay options.
       * @param {string} [options.query] Initial search text.
       * @returns {Promise<HTMLIFrameElement>} The overlay iframe.
       */
      open: async (options = {}) => {
        const query = options.query?.trim() ?? ''
        const src = buildUrl('/tiendu/search', query ? { q: query } : undefined)
        return await openOverlayIframe({
          src,
          waitForReady: true,
          onMessage: (message) => {
            if (message?.type === 'search') {
              trackSearch(typeof message.query === 'string' ? message.query : '')
            }
          },
        })
      },
    },
    cart: {
      /**
       * Add a variant to the cart and open the cart overlay.
       *
       * @param {TienduProductVariant} productVariant Variant to add.
       * @param {number} quantity Quantity to add.
       * @param {Function} [onClose] Called with the updated quantity when the cart closes.
       * @param {TienduProduct} [product] Product that owns the variant.
       * @returns {Promise<void>} When the cart overlay has opened.
       */
      addProductVariant: async (productVariant, quantity, onClose, product) => {
        const previousCart = await methods.cart.getQuantity().catch(() => ({ quantity: 0 }))
        await requester.post(`${baseApiUrl}/cart/products/variants/${productVariant.id}`, { quantity })
        await waitForCartSync(methods.cart.getQuantity, previousCart.quantity)
        trackAddToCart(productVariant, quantity, product)
        await methods.cart.open(onClose)
      },
      /**
       * Read the current cart quantity.
       *
       * @returns {Promise<{quantity: number}>} The cart quantity.
       */
      getQuantity: async () => {
        const response = await requester.get(`${baseApiUrl}/cart/quantity`)

        return {
          quantity:
            typeof response.data?.quantity === 'number'
              ? response.data.quantity
              : typeof response.quantity === 'number'
                ? response.quantity
                : 0,
        }
      },
      /**
       * Open checkout. Pass `couponCode` to land on the coupon step with that code filled.
       * Storefront URLs with `?cupon=CODE` are stripped and opened the same way.
       *
       * @param {Function} [onClose]
       * @param {Object} [options]
       * @param {string} [options.couponCode]
       * @returns {Promise<HTMLIFrameElement>} The checkout overlay iframe.
       */
      open: async (onClose, options = {}) => {
        const rawCouponCode = typeof options.couponCode === 'string' ? options.couponCode : ''
        const couponCode = rawCouponCode
          .replaceAll(' ', '-')
          .replace(/[^a-zA-Z0-9-]/g, '')
          .toUpperCase()
        const firedSteps = new Set()
        return await openOverlayIframe({
          src: couponCode ? buildUrl('/tiendu/checkout', { cupon: couponCode }) : '/tiendu/checkout',
          waitForReady: true,
          onMessage: (message) => {
            if (message.type === 'close' && onClose && typeof message.updatedCartItemsQuantity === 'number') {
              onClose({ updatedCartItemsQuantity: message.updatedCartItemsQuantity })
            }

            if (message.type === 'step-changed') {
              const totalPriceInCents = typeof message.totalPriceInCents === 'number' ? message.totalPriceInCents : null
              const items = Array.isArray(message.items) ? message.items : null
              if (totalPriceInCents == null || items == null) return

              if (message.step === 'delivery' && !firedSteps.has('delivery')) {
                firedSteps.add('delivery')
                trackInitiateCheckout(totalPriceInCents, items)
              } else if (message.step === 'success' && !firedSteps.has('success')) {
                firedSteps.add('success')
                trackPurchase(totalPriceInCents, items, message.orderId)
              }
            }
          },
        })
      },
    },
    shopper: {
      /**
       * Open the store account overlay.
       *
       * @param {Object} [options]
       * @param {'sign-in'|'sign-up'} [options.mode]
       * @param {number} [options.productId] Product to save after successful authentication.
       * @returns {Promise<HTMLIFrameElement>} The account overlay iframe.
       */
      open: async (options = {}) => {
        const queryParams = {}
        queryParams.mode = options.mode === 'sign-up' ? 'sign-up' : 'sign-in'
        const productId = Number(options.productId)
        if (Number.isFinite(productId) && productId > 0) queryParams.wishlistProductId = productId
        return await openOverlayIframe({
          src: buildUrl('/tiendu/account', queryParams),
          waitForReady: true,
          onMessage: async (message) => {
            if (message?.type === 'shopper-authenticated') {
              const pending = Number(message.pendingWishlistProductId)
              if (Number.isFinite(pending) && pending > 0) {
                await methods.wishlist.toggle(pending).catch(() => {})
              }
              window.dispatchEvent(new CustomEvent('tiendu:shopper-status'))
            }
            if (message?.type === 'shopper-status-changed') {
              window.dispatchEvent(new CustomEvent('tiendu:shopper-status'))
            }
            if (message?.type === 'open-wishlist') {
              void methods.wishlist.open()
            }
          },
        })
      },
      /**
       * Read the current shopper status.
       *
       * @returns {Promise<{shopper: {id:number,email:string,name:string,surname:string}|null, wishlistCount:number, wishlistProductIds:number[]}>} The shopper status.
       */
      getStatus: async () => {
        const response = await requester.get(`${baseApiUrl}/shopper`)
        return {
          shopper: response.shopper ?? null,
          wishlistCount:
            typeof response.wishlistCount === 'number' ? response.wishlistCount : 0,
          wishlistProductIds: Array.isArray(response.wishlistProductIds)
            ? response.wishlistProductIds
            : [],
        }
      },
    },
    wishlist: {
      /**
       * Open the wishlist overlay, asking for sign-in first when needed.
       *
       * @returns {Promise<HTMLIFrameElement>} The overlay iframe.
       */
      open: async () => {
        const status = await methods.shopper.getStatus().catch(() => ({ shopper: null }))
        if (!status?.shopper) {
          return methods.shopper.open({ mode: 'sign-in' })
        }
        return await openOverlayIframe({
          src: '/tiendu/wishlist',
          waitForReady: true,
          onMessage: (message) => {
            if (message?.type === 'shopper-status-changed') {
              window.dispatchEvent(new CustomEvent('tiendu:shopper-status'))
            }
            if (message?.type === 'open-account') {
              void methods.shopper.open({
                mode: message.mode === 'sign-in' ? 'sign-in' : 'sign-up',
              })
            }
          },
        })
      },
      /**
       * Toggle a product in the shopper wishlist.
       *
       * @param {number} productId Product id to toggle.
       * @returns {Promise<*>} The wishlist response.
       */
      toggle: async (productId) => {
        const result = await requester.post(`${baseApiUrl}/wishlist/products/${productId}`, {})
        window.dispatchEvent(new CustomEvent('tiendu:shopper-status'))
        return result
      },
    },
  }

  if (typeof window !== 'undefined' && window.parent === window && !didAutoOpenCoupon) {
    const url = new URL(window.location.href)
    const rawCupon = url.searchParams.get('cupon')
    if (rawCupon) {
      const couponCode = String(rawCupon)
        .replaceAll(' ', '-')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toUpperCase()
      url.searchParams.delete('cupon')
      const nextSearch = url.searchParams.toString()
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`,
      )
      if (couponCode) {
        didAutoOpenCoupon = true
        const openCouponCheckout = () => {
          void methods.cart.open(undefined, { couponCode })
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', openCouponCheckout, { once: true })
        } else {
          queueMicrotask(openCouponCheckout)
        }
      }
    }
  }

  return methods
}

window.Tiendu = Tiendu

export default Tiendu

/* local theme tweak */
