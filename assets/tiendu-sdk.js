/*! tiendu-sdk 2.3.0 */
const getCurrency = preferredCurrency => {
	if (typeof document === 'undefined' && typeof preferredCurrency !== 'string')
		return 'UYU'
	const currency = preferredCurrency ?? document.body?.dataset?.storeCurrency
	return typeof currency === 'string' && currency.trim()
		? currency.trim().toUpperCase()
		: 'UYU'
}

const generateEventId = () => {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID()
	}
	return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const readCookie = name => {
	if (typeof document === 'undefined' || !document.cookie) return null
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = document.cookie.match(
		new RegExp('(?:^|; )' + escaped + '=([^;]*)')
	)
	return match ? decodeURIComponent(match[1]) : null
}

const PRODUCT_VARIANT_ID_PREFIX = 'TIENDU_PRODUCT_VARIANT_ID_'
const variantContentId = variantId => `${PRODUCT_VARIANT_ID_PREFIX}${variantId}`
const buildCheckoutContents = items => {
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

// One mapping preserves the SDK 1 browser and conversion payloads.
const eventPayloads = {
	view_item: ({ product, variant }) => {
		if (!variant || !Number.isFinite(Number(variant.id))) return
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
			currency
		}

		const ga4Data = {
			currency,
			value,
			items: [
				{
					item_id: contentId,
					item_name: product?.title ?? '',
					price: value,
					quantity: 1
				}
			]
		}
		return { metaName: 'ViewContent', meta: fbqData, ga4: ga4Data }
	},
	add_to_cart: ({ variant, quantity = 1, product }) => {
		if (!variant || !Number.isFinite(Number(variant.id))) return
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
			contents: [{ id: contentId, quantity }]
		}

		const ga4Data = {
			currency,
			value,
			items: [
				{
					item_id: contentId,
					...(productTitle ? { item_name: productTitle } : {}),
					price: unitPrice,
					quantity
				}
			]
		}
		return { metaName: 'AddToCart', meta: fbqData, ga4: ga4Data }
	},
	search: ({ query }) => {
		const trimmed = typeof query === 'string' ? query.trim() : ''
		if (!trimmed) return

		const fbqData = { search_string: trimmed }

		return { metaName: 'Search', meta: fbqData, ga4: { search_term: trimmed } }
	},
	begin_checkout: ({ totalPriceInCents, items }) => {
		const value = (Number(totalPriceInCents) || 0) / 100
		const contents = buildCheckoutContents(items)
		const numItems = contents.reduce((acc, item) => acc + item.quantity, 0)

		const fbqData = {
			content_type: 'product',
			value,
			currency: getCurrency(),
			contents,
			num_items: numItems
		}

		const ga4Data = {
			currency: getCurrency(),
			value,
			items: contents.map(entry => ({
				item_id: entry.id,
				quantity: entry.quantity
			}))
		}
		return { metaName: 'InitiateCheckout', meta: fbqData, ga4: ga4Data }
	},
	purchase: ({ totalPriceInCents, items, orderId }) => {
		const value = (Number(totalPriceInCents) || 0) / 100
		const contents = buildCheckoutContents(items)
		const numItems = contents.reduce((acc, item) => acc + item.quantity, 0)

		const fbqData = {
			content_type: 'product',
			value,
			currency: getCurrency(),
			contents,
			num_items: numItems,
			...(orderId ? { order_id: orderId } : {})
		}

		const ga4Data = {
			currency: getCurrency(),
			value,
			...(orderId ? { transaction_id: orderId } : {}),
			items: contents.map(entry => ({
				item_id: entry.id,
				quantity: entry.quantity
			}))
		}
		return { metaName: 'Purchase', meta: fbqData, ga4: ga4Data }
	}
}

const clients = new Map()
let activeOverlay = null

/**
 * Crea o reutiliza el cliente de la tienda; descubre los meta tags tiendu:store/origin.
 * @method Tiendu
 * @param {Object} [options] Configuración para páginas headless o temas.
 * @param {string} [options.storeHandle] Handle de la tienda.
 * @param {string} [options.origin] Origen de la Storefront API.
 * @param {Object} [options.search] suggestions: lista de búsquedas sugeridas.
 * @param {Object} [options.analytics] pageViews: false desactiva la vista automática (SPA).
 * @param {Object} [options.couponLinks] enabled: false desactiva la apertura automática de enlaces con cupones.
 * @param {Object} [options.session] persist: false mantiene la sesión solo en memoria, sin leer ni escribir localStorage.
 * @returns {Object} Cliente compartido por origen y tienda.
 */
export const Tiendu = (options = {}) => {
	const handle =
		options.storeHandle ??
		document.querySelector('meta[name="tiendu:store"]')?.content
	const origin =
		options.origin ??
		document.querySelector('meta[name="tiendu:origin"]')?.content
	if (!handle || !origin)
		throw new Error('Falta la configuración de la tienda y del origen Tiendu.')
	const base = new URL(origin).origin
	const key = `${base}/${handle}`
	if (clients.has(key)) {
		const existing = clients.get(key)
		if (options.search && Object.hasOwn(options.search, 'suggestions'))
			existing.search.suggestions = options.search.suggestions
		return existing.client
	}
	const trackingEnabled =
		document.querySelector('meta[name="tiendu:analytics"]')?.content !== 'off'
	const searchDefaults = { suggestions: options.search?.suggestions ?? [] }
	const persistSession = options.session?.persist !== false
	const storageKey = `tiendu:shopper:${key}`
	let sessionToken = null
	try {
		if (persistSession) sessionToken = window.localStorage.getItem(storageKey)
	} catch {}
	const saveToken = token => {
		if (typeof token !== 'string' || !token || token === sessionToken) return
		sessionToken = token
		try {
			if (persistSession) window.localStorage.setItem(storageKey, token)
		} catch {}
	}
	const acceptTokens = value => {
		if (!value || typeof value !== 'object') return
		if (typeof value.session?.token === 'string') saveToken(value.session.token)
		for (const child of Object.values(value)) acceptTokens(child)
	}
	const sessionHeaders = () =>
		sessionToken ? { 'X-Shopper-Session': sessionToken } : {}
	const notifyStatus = () =>
		window.dispatchEvent(new CustomEvent('tiendu:shopper-status'))
	let sessionReady = Promise.resolve()
	/**
	 * Ejecuta GraphQL y guarda los tokens devueltos antes de informar errores.
	 * @method query
	 * @method mutate
	 * @param {string} query Operación GraphQL.
	 * @param {Object} [variables] Variables de la operación.
	 * @param {string} [operationName] Nombre de la operación.
	 * @returns {Promise<Object>} El objeto data completo.
	 */
	async function request(query, variables = {}, operationName, signal) {
		if (signal) {
			await new Promise((resolve, reject) => {
				const abort = () => {
					signal.removeEventListener('abort', abort)
					reject(signal.reason ?? new Error('Request aborted'))
				}
				signal.addEventListener('abort', abort, { once: true })
				if (signal.aborted) abort()
				else
					sessionReady.then(
						() => {
							signal.removeEventListener('abort', abort)
							resolve()
						},
						error => {
							signal.removeEventListener('abort', abort)
							reject(error)
						}
					)
			})
		} else await sessionReady
		const response = await fetch(
			`${base}/${encodeURIComponent(handle)}/api/graphql`,
			{
				method: 'POST',
				...(signal ? { signal } : {}),
				credentials: 'omit',
				headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
				body: JSON.stringify({ query, variables, operationName })
			}
		)
		const result = await response.json()
		acceptTokens(result.data)
		if (!response.ok || result.errors)
			throw Object.assign(
				new Error(
					result.errors?.[0]?.message ?? 'No pudimos completar la solicitud.'
				),
				{ errors: result.errors }
			)
		return result.data
	}
	/**
	 * @method track
	 * Registra un evento y dispara los tags presentes en la página, sin cargarlos.
	 * page_view crea la sesión compartida; se envía automáticamente al iniciar.
	 * Para navegación SPA usar analytics.pageViews: false y llamar track al navegar.
	 * @param {'page_view'|'view_item'|'add_to_cart'|'search'|'begin_checkout'|'purchase'} event Evento estándar.
	 * @param {Object} [data] Datos del evento.
	 * @param {Object} [data.product] Producto: title, currency, basePriceInCents.
	 * @param {Object} [data.variant] Variante: id y priceInCents (o price de GraphQL).
	 * @param {number} [data.quantity] Unidades agregadas; por defecto 1.
	 * @param {string} [data.query] Búsqueda.
	 * @param {number} [data.totalPriceInCents] Total del checkout en centésimos.
	 * @param {Array<Object>} [data.items] productVariantId y quantity del checkout.
	 * @param {number|string} [data.orderId] Identificador del pedido.
	 * @returns {Promise<void>} Se resuelve incluso si falla el envío de analítica.
	 */
	const track = async (event, data = {}) => {
		if (!trackingEnabled) return
		if (event !== 'page_view' && !Object.hasOwn(eventPayloads, event))
			throw new Error('Evento de analítica desconocido.')
		const variant = data.variant && {
			...data.variant,
			priceInCents: data.variant.priceInCents ?? data.variant.price
		}
		const payload =
			event === 'page_view' ? null : eventPayloads[event]({ ...data, variant })
		if (event !== 'page_view' && !payload) return
		const eventId = generateEventId()
		// A broken third-party tag must not prevent the other destinations.
		try {
			if (payload && typeof window.fbq === 'function')
				window.fbq('track', payload.metaName, payload.meta, {
					eventID: eventId
				})
		} catch {}
		try {
			if (payload && typeof window.gtag === 'function')
				window.gtag('event', event, payload.ga4)
		} catch {}
		await sessionReady
		try {
			const ga = readCookie('_ga')?.split('.')
			const response = await fetch(
				`${base}/${encodeURIComponent(handle)}/api/events`,
				{
					method: 'POST',
					credentials: 'omit',
					keepalive: true,
					headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
					body: JSON.stringify({
						event,
						eventId,
						url: window.location.href,
						referrer: document.referrer || null,
						data: payload ? { meta: payload.meta, ga4: payload.ga4 } : {},
						fbp: readCookie('_fbp'),
						fbc: readCookie('_fbc'),
						gaClientId: ga?.length >= 4 ? ga.slice(-2).join('.') : null
					})
				}
			)
			acceptTokens(await response.json())
		} catch {}
	}
	/**
	 * Abre un overlay y espera el intercambio ready/init con la sesión compartida.
	 * @method open
	 * @param {string} overlay search, account, wishlist o checkout.
	 * @param {Object} [params] Parámetros del overlay.
	 * @returns {Promise<HTMLIFrameElement>} Iframe listo.
	 */
	const open = async (overlay, params = {}) => {
		await sessionReady
		return new Promise((resolve, reject) => {
			const replacing = !!activeOverlay
			activeOverlay?.(true)
			const iframe = document.createElement('iframe')
			const src = new URL(
				`/${encodeURIComponent(handle)}/embed/${overlay}`,
				base
			)
			for (const [name, value] of Object.entries(params))
				if (overlay !== 'search' && value != null)
					src.searchParams.set(name === 'query' ? 'q' : name, String(value))
			iframe.src = src.href
			iframe.id = 'left-iframe'
			iframe.title =
				{
					search: 'Buscador',
					account: 'Mi cuenta',
					wishlist: 'Favoritos',
					checkout: 'Compra'
				}[overlay] ?? overlay
			Object.assign(iframe.style, {
				position: 'fixed',
				inset: '0',
				width: '100%',
				height: '100%',
				border: '0',
				zIndex: '2147483646',
				background: 'transparent'
			})
			const historyId = crypto.randomUUID()
			const firedSteps = new Set()
			let closed = false,
				ready = false
			const restoreOverflow = document.documentElement.style.overflow
			document.documentElement.style.overflow = 'hidden'
			const cleanup = (fromHistory = false) => {
				if (closed) return
				closed = true
				window.removeEventListener('message', receive)
				window.removeEventListener('popstate', pop)
				iframe.remove()
				document.documentElement.style.overflow = restoreOverflow
				if (activeOverlay === cleanup) activeOverlay = null
				if (!fromHistory && history.state?.tienduOverlayId === historyId) {
					if ((history.state.tienduOverlayDepth ?? 1) > 1)
						history.go(-history.state.tienduOverlayDepth)
					else history.back()
				}
				if (!ready) reject(new Error('La ventana se cerró antes de cargar.'))
				// The overlay may have changed the cart or the shopper: pages
				// refresh their badges on this event.
				window.dispatchEvent(
					new CustomEvent('tiendu:overlay-close', { detail: { overlay } })
				)
			}
			const pop = () => {
				if (
					overlay === 'checkout' &&
					history.state?.tienduOverlayId === historyId
				) {
					iframe.contentWindow.postMessage(
						{
							type: 'checkout-history-navigation',
							step: history.state.tienduOverlayStep
						},
						base
					)
				} else cleanup(true)
			}
			const receive = event => {
				if (event.source !== iframe.contentWindow || event.origin !== base)
					return
				const message = event.data
				if (message?.type === 'ready') {
					iframe.contentWindow.postMessage(
						{
							type: 'init',
							protocol: 1,
							sessionToken,
							storeUrl: window.location.origin,
							...(overlay === 'search'
								? {
										query: params.query ?? '',
										searchSuggestions: params.suggestions ?? []
									}
								: {})
						},
						base
					)
					ready = true
					resolve(iframe)
				} else if (message?.type === 'session-changed')
					saveToken(message.sessionToken)
				else if (message?.type === 'shopper-status-changed') notifyStatus()
				else if (message?.type === 'shopper-authenticated') {
					const pending = Number(message.pendingWishlistProductId)
					if (Number.isSafeInteger(pending) && pending > 0)
						void request(
							'mutation($id:ID!){wishlistAdd(productId:$id){session{token} userErrors{code field message}}}',
							{ id: String(pending) }
						)
							.then(notifyStatus)
							.catch(() => {})
					else notifyStatus()
				} else if (message?.type === 'open-account')
					void open('account', { mode: message.mode })
				else if (message?.type === 'open-wishlist') void open('wishlist')
				else if (message?.type === 'search' && overlay === 'search')
					void track('search', { query: message.query })
				else if (message?.type === 'close') cleanup()
				else if (
					message?.type === 'navigate' &&
					typeof message.url === 'string'
				) {
					const target = new URL(message.url, window.location.origin)
					if (target.origin === window.location.origin)
						window.location.assign(target.href)
				} else if (message?.type === 'checkout-history-back') history.back()
				else if (message?.type === 'step-changed') {
					if (
						overlay === 'checkout' &&
						typeof message.totalPriceInCents === 'number' &&
						Array.isArray(message.items) &&
						!firedSteps.has(message.step)
					) {
						if (
							message.checkoutStarted ||
							message.step === 'delivery' ||
							message.step === 'contact' ||
							message.step === 'success'
						) {
							const event =
								message.step === 'success' ? 'purchase' : 'begin_checkout'
							if (!firedSteps.has(event)) {
								firedSteps.add(event)
								void track(event, message)
							}
						}
					}
					if (message.historyAction === 'none') return
					const push =
						overlay === 'checkout' && message.historyAction === 'push'
					history[push ? 'pushState' : 'replaceState'](
						{
							...history.state,
							tienduOverlayStep: message.step,
							tienduOverlayDepth:
								(history.state?.tienduOverlayDepth ?? 1) + (push ? 1 : 0)
						},
						'',
						window.location.href
					)
				}
			}
			window.addEventListener('message', receive)
			window.addEventListener('popstate', pop)
			history[replacing ? 'replaceState' : 'pushState'](
				{
					...history.state,
					tienduOverlayId: historyId,
					tienduOverlayDepth: 1,
					tienduOverlay: overlay
				},
				'',
				window.location.href
			)
			activeOverlay = cleanup
			iframe.onerror = () => {
				cleanup()
				reject(new Error('No pudimos abrir la ventana.'))
			}
			document.body.appendChild(iframe)
		})
	}
	const checked = payload => {
		if (payload.userErrors?.length)
			throw Object.assign(new Error(payload.userErrors[0].message), {
				userErrors: payload.userErrors,
				externalReference: payload.externalReference,
				code: payload.userErrors[0].code
			})
		return payload
	}
	/**
	 * Lee el cliente y sus favoritos.
	 * @method shopper.getStatus
	 * @returns {Promise<Object>} shopper, wishlistCount y wishlistProductIds.
	 */
	const getStatus = async () => {
		const { customer } = await request(
			'{customer{id email name surname phone wishlistProductIds}}'
		)
		const ids = (customer?.wishlistProductIds ?? []).map(Number)
		return {
			shopper: customer ? { ...customer, id: Number(customer.id) } : null,
			wishlistCount: ids.length,
			wishlistProductIds: ids
		}
	}
	/**
	 * Agrega una variante; registra add_to_cart al completar. No abre el checkout.
	 * @method cart.add
	 * @param {Object|string|number} variant Id o variante con id y priceInCents/price.
	 * @param {number} [quantity] Cantidad, por defecto 1.
	 * @param {Object} [product] title, currency y basePriceInCents para analítica.
	 * @returns {Promise<Object>} Carrito actualizado.
	 */
	const add = async (variant, quantity = 1, product) => {
		const variantId = typeof variant === 'object' ? variant.id : variant
		const { cartLinesAdd } = await request(
			'mutation($lines:[CartLineAddInput!]!){cartLinesAdd(lines:$lines){cart{quantity subtotal currency lines{id quantity variantId}} session{token} userErrors{code field message}}}',
			{ lines: [{ variantId: String(variantId), quantity }] }
		)
		const cart = checked(cartLinesAdd).cart
		void track('add_to_cart', {
			variant: typeof variant === 'object' ? variant : { id: Number(variant) },
			quantity,
			product
		})
		return cart
	}
	let toggling = Promise.resolve()
	/**
	 * Agrega o quita un favorito; serializa cambios concurrentes.
	 * @method wishlist.toggle
	 * @param {number|string} productId Id del producto.
	 * @returns {Promise<Object>} saved, count y productIds.
	 */
	const toggle = async productId => {
		const status = await getStatus()
		const saved = !status.wishlistProductIds.includes(Number(productId))
		const name = saved ? 'wishlistAdd' : 'wishlistRemove'
		const payload = checked(
			(
				await request(
					`mutation($id:ID!){${name}(productId:$id){customer{wishlistProductIds} session{token} userErrors{code field message}}}`,
					{ id: String(productId) }
				)
			)[name]
		)
		const ids = payload.customer.wishlistProductIds.map(Number)
		notifyStatus()
		return { saved, count: ids.length, productIds: ids }
	}
	const paymentWindows = new Map()
	const paymentStorageKey = `tiendu:payment:${key}`
	let returnedPaymentReference = null
	const consumePaymentReference = () => {
		if (typeof window === 'undefined' || !window.location?.href) return
		const url = new URL(window.location.href)
		const reference = url.searchParams.get('tienduPayment')
		if (reference) {
			returnedPaymentReference = reference
			url.searchParams.delete('tienduPayment')
			window.history.replaceState(window.history.state, '', url.href)
			try {
				if (persistSession) window.sessionStorage.setItem(paymentStorageKey, reference)
			} catch {}
		}
	}
	consumePaymentReference()
	const currentPaymentReference = () => {
		consumePaymentReference()
		if (returnedPaymentReference) return returnedPaymentReference
		try {
			if (persistSession) return window.sessionStorage.getItem(paymentStorageKey)
		} catch {}
		return null
	}
	/**
	 * Lee el estado verificado de un intento de pago; nunca interpreta el retorno como aprobación.
	 * @method checkout.getPayment
	 * @param {string} [externalReference] Referencia; por defecto tienduPayment de la URL o el último intento de esta pestaña.
	 * @returns {Promise<Object|null>} Estado del intento y pedido, si existe.
	 */
	const getPayment = async (
		externalReference = currentPaymentReference(),
		signal
	) => {
		if (!externalReference) return null
		const data = await request(
			'query($reference:String!){checkoutPayment(reference:$reference){reference state lastPaymentStatus canResume paymentUrl orderId orderStatus}}',
			{ reference: externalReference },
			undefined,
			signal
		)
		return data.checkoutPayment
	}
	/**
	 * Espera el resultado verificado; al vencer el plazo devuelve el último estado pendiente.
	 * @method checkout.waitForPayment
	 * @param {string} [externalReference] Referencia del intento; por defecto la del retorno.
	 * @param {Object} [options] timeoutMs (120000 por defecto, máximo 600000) y signal para cancelar la espera.
	 * @returns {Promise<Object|null>} Estado verificado; REJECTED no termina la espera. EXPIRED/REPLACED no cancelan un pago iniciado.
	 */
	const waitForPayment = async (
		externalReference = currentPaymentReference(),
		{ timeoutMs = 120000, signal } = {}
	) => {
		if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 600000)
			throw new TypeError('Invalid payment timeoutMs')
		if (!externalReference) return null
		const popup = paymentWindows.get(externalReference)
		const deadline = Date.now() + timeoutMs
		const controller = new AbortController()
		let lastResult = null
		let timedOut = false
		const timeoutError = Object.assign(
			new Error('Payment status request timed out'),
			{ code: 'PAYMENT_STATUS_TIMEOUT', externalReference }
		)
		const expiry = setTimeout(() => {
			timedOut = true
			controller.abort(timeoutError)
		}, timeoutMs)
		const abort = () =>
			controller.abort(signal.reason ?? new Error('Payment wait aborted'))
		signal?.addEventListener('abort', abort, { once: true })
		let wake
		const receive = event => {
			if (
				popup &&
				event.source === popup &&
				event.origin === base &&
				event.data?.type === 'finish' &&
				event.data.externalReference === externalReference
			)
				wake?.()
		}
		window.addEventListener('message', receive)
		try {
			while (true) {
				if (signal?.aborted)
					throw signal.reason ?? new Error('Payment wait aborted')
				if (timedOut) {
					if (lastResult) return lastResult
					throw timeoutError
				}
				const result = await getPayment(externalReference, controller.signal)
				lastResult = result
				if (
					result && ['PAID', 'PAYMENT_PENDING', 'CANCELLED', 'EXPIRED', 'REPLACED'].includes(result.state)
				) {
					// A pending ticket's provider page shows its payment code; keep it open.
					if (result.state === 'PAID' && popup && !popup.closed) popup.close()
					paymentWindows.delete(externalReference)
					return result
				}
				if (Date.now() >= deadline) return result
				await new Promise(resolve => {
					const done = () => {
						clearTimeout(timer)
						controller.signal.removeEventListener('abort', done)
						wake = undefined
						resolve()
					}
					const timer = setTimeout(
						done,
						Math.min(2000, Math.max(0, deadline - Date.now()))
					)
					wake = done
					controller.signal.addEventListener('abort', done, { once: true })
					if (controller.signal.aborted) done()
				})
			}
		} catch (error) {
			if (timedOut && lastResult) return lastResult
			throw error
		} finally {
			clearTimeout(expiry)
			signal?.removeEventListener('abort', abort)
			window.removeEventListener('message', receive)
		}
	}
	/**
	 * Crea el pago de Mercado Pago y abre una ventana o navega en esta pestaña.
	 * @method checkout.pay
	 * @param {Object} options totalDisplayedPriceInCents requerido; customer opcional; mode popup (por defecto) o redirect; returnUrl de esta tienda (por defecto la página actual).
	 * @returns {Promise<Object>} paymentUrl y externalReference; usar waitForPayment para consultar el resultado.
	 */
	let paymentStarting = false
	const pay = async ({
		totalDisplayedPriceInCents,
		customer,
		mode = 'popup',
		returnUrl = window.location.href
	} = {}) => {
		if (
			!['popup', 'redirect'].includes(mode) ||
			!Number.isSafeInteger(totalDisplayedPriceInCents) ||
			totalDisplayedPriceInCents < 0
		)
			throw new TypeError('Invalid Mercado Pago checkout options')
		if (
			mode === 'popup' &&
			new URL(returnUrl).origin !== window.location.origin
		)
			throw new TypeError('Popup returnUrl must share the client origin')
		if (paymentStarting)
			throw Object.assign(new Error('Payment creation already in progress'), {
				code: 'PAYMENT_IN_PROGRESS'
			})
		paymentStarting = true
		let popup = null
		try {
			// Reserve synchronously during the click, before any session/network await.
			popup =
				mode === 'popup'
					? window.open('', '_blank', 'width=1024,height=700')
					: null
			if (mode === 'popup' && !popup)
				throw Object.assign(new Error('Payment popup blocked'), {
					code: 'POPUP_BLOCKED'
				})
			const payload = checked(
				(
					await request(
						'mutation($input:CheckoutCompleteInput!){checkoutComplete(input:$input){paymentUrl externalReference session{token} userErrors{code field message}}}',
						{
							input: {
								paymentMethod: 'mercado_pago',
								customer,
								totalDisplayedPriceInCents,
								returnMode: mode,
								returnUrl
							}
						}
					)
				).checkoutComplete
			)
			returnedPaymentReference = payload.externalReference
			if (!payload.paymentUrl || !payload.externalReference)
				throw new Error('Missing payment preference')
			try {
				if (persistSession)
					window.sessionStorage.setItem(
						paymentStorageKey,
						payload.externalReference
					)
			} catch {}
			if (popup) {
				paymentWindows.set(payload.externalReference, popup)
				popup.location.replace(payload.paymentUrl)
			} else window.location.assign(payload.paymentUrl)
			return {
				paymentUrl: payload.paymentUrl,
				externalReference: payload.externalReference
			}
		} catch (error) {
			if (error.externalReference) {
				returnedPaymentReference = error.externalReference
				try { if (persistSession) window.sessionStorage.setItem(paymentStorageKey, error.externalReference) } catch {}
			}
			popup?.close()
			throw error
		} finally {
			paymentStarting = false
		}
	}
	const client = {
		track,
		query: request,
		mutate: request,
		open,
		search: {
			/**
			 * Abre el buscador.
			 * @method search.open
			 * @param {Object} [options] query y suggestions (sobrescriben la configuración inicial).
			 * @returns {Promise<HTMLIFrameElement>} Iframe listo.
			 */
			open: ({ query = '', suggestions = searchDefaults.suggestions } = {}) =>
				open('search', { query, suggestions })
		},
		cart: {
			add,
			/**
			 * Lee las unidades del carrito.
			 * @method cart.getQuantity
			 * @returns {Promise<Object>} quantity.
			 */
			getQuantity: async () => ({
				quantity: (await request('{cart{quantity}}')).cart.quantity
			})
		},
		shopper: {
			getStatus,
			/**
			 * Abre la cuenta de cliente.
			 * @method shopper.open
			 * @param {Object} [options] mode, productId para favorito pendiente y pedido.
			 * @returns {Promise<HTMLIFrameElement>} Iframe listo.
			 */
			open: ({ mode = 'sign-in', productId, pedido } = {}) =>
				open('account', { mode, wishlistProductId: productId, pedido })
		},
		checkout: {
			pay,
			getPayment,
			waitForPayment,
			/**
			 * Abre el checkout.
			 * @method checkout.open
			 * @param {Object} [options] couponCode y startStep opcionales.
			 * @param {string} [options.startStep] cart, delivery, contact, summary o payment-options; cart por defecto.
			 * @param {string} [options.couponCode] Código precargado; el cliente lo confirma en el paso de cupón.
			 * @returns {Promise<HTMLIFrameElement>} Iframe listo.
			 */
			open: ({ couponCode = '', startStep = 'cart' } = {}) => {
				if (
					![
						'cart',
						'delivery',
						'contact',
						'summary',
						'payment-options'
					].includes(startStep)
				)
					return Promise.reject(
						new TypeError(`Invalid checkout startStep: ${startStep}`)
					)
				const code =
					typeof couponCode === 'string'
						? couponCode
								.replaceAll(' ', '-')
								.replace(/[^a-zA-Z0-9-]/g, '')
								.toUpperCase()
						: ''
				return open('checkout', {
					...(code ? { cupon: code } : {}),
					...(startStep !== 'cart' ? { startStep } : {})
				})
			}
		},
		wishlist: {
			/**
			 * Abre favoritos o solicita iniciar sesión.
			 * @method wishlist.open
			 * @returns {Promise<HTMLIFrameElement>} Iframe listo.
			 */
			open: async () =>
				(await getStatus()).shopper
					? open('wishlist')
					: open('account', { mode: 'sign-in' }),
			// Toggles run one after another, so a double click reads the state the
			// previous toggle left instead of racing it.
			toggle: productId =>
				(toggling = toggling.catch(() => {}).then(() => toggle(productId)))
		},
		functions: {
			/**
			 * Llama una Function con la sesión actual y sin cookies.
			 * @method functions.fetch
			 * @param {string} slug Slug de la Function.
			 * @param {Object} [init] Opciones de fetch.
			 * @returns {Promise<Response>} Respuesta original.
			 */
			fetch: async (slug, init = {}) => {
				await sessionReady
				const headers = new Headers(init.headers)
				if (sessionToken) headers.set('X-Shopper-Session', sessionToken)
				return fetch(
					`${base}/${encodeURIComponent(handle)}/functions/${encodeURIComponent(slug)}`,
					{ ...init, headers, credentials: 'omit' }
				)
			}
		}
	}

	clients.set(key, { client, search: searchDefaults })
	if (options.analytics?.pageViews !== false) {
		const pageView = track('page_view')
		// Without a stored session the page view creates it, so the first API
		// call, Function call or overlay waits for it and shares one session.
		// The wait never exceeds 3 s: analytics must not block the store.
		if (!sessionToken)
			sessionReady = Promise.race([
				pageView,
				new Promise(resolve => setTimeout(resolve, 3000))
			])
	}
	// Consume the link synchronously so theme-level fallbacks cannot open it twice.
	// Only initialization handles links; importing the module has no client side effects.
	if (
		options.couponLinks?.enabled !== false &&
		typeof window !== 'undefined' &&
		window.parent === window
	) {
		const url = new URL(window.location.href)
		const rawCoupon = url.searchParams.get('cupon')
		if (rawCoupon !== null) {
			const couponCode = rawCoupon
				.replaceAll(' ', '-')
				.replace(/[^a-zA-Z0-9-]/g, '')
				.toUpperCase()
			url.searchParams.delete('cupon')
			window.history.replaceState(
				window.history.state,
				'',
				`${url.pathname}${url.search}${url.hash}`
			)
			if (couponCode) {
				const openCouponCheckout = () => {
					void client.checkout.open({ couponCode }).catch(error => {
						console.error('No pudimos abrir el cupón.', error)
					})
				}
				if (document.readyState === 'loading')
					document.addEventListener('DOMContentLoaded', openCouponCheckout, {
						once: true
					})
				else queueMicrotask(openCouponCheckout)
			}
		}
	}
	return client
}
if (typeof window !== 'undefined') window.Tiendu = Tiendu
export default Tiendu
