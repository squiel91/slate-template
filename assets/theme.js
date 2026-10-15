const tiendu = window.Tiendu()

const badgeValue = quantity => String(Math.max(0, Number(quantity) || 0))

async function syncCartBadge() {
	let quantity = 0
	try {
		quantity = (await tiendu.cart.getQuantity()).quantity
	} catch {
		quantity = 0
	}
	for (const badge of document.querySelectorAll('[data-cart-quantity]')) {
		badge.textContent = badgeValue(quantity)
	}
}

const selectedVariant = button => {
	const select = (button.closest('form') ?? document).querySelector(
		'[data-variant-select]'
	)
	if (select instanceof HTMLSelectElement) {
		const option = select.selectedOptions[0]
		return {
			id: Number(select.value),
			priceInCents: Number(option?.dataset.price)
		}
	}
	return {
		id: Number(button.dataset.variantId),
		priceInCents: Number(button.dataset.price)
	}
}

document.addEventListener('click', async event => {
	const target = event.target instanceof Element ? event.target : null
	const button = target?.closest(
		'[data-cart-open],[data-search-open],[data-account-open],[data-wishlist-open],[data-wishlist-toggle],[data-add-to-cart]'
	)
	if (!(button instanceof HTMLElement)) return

	try {
		if (button.hasAttribute('data-cart-open')) {
			await tiendu.cart.open(() => void syncCartBadge())
		} else if (button.hasAttribute('data-search-open')) {
			await tiendu.search.open()
		} else if (button.hasAttribute('data-account-open')) {
			await tiendu.shopper.open()
		} else if (button.hasAttribute('data-wishlist-open')) {
			await tiendu.wishlist.open()
		} else if (button.hasAttribute('data-wishlist-toggle')) {
			const productId = Number(button.dataset.productId)
			if (Number.isFinite(productId) && productId > 0)
				await tiendu.wishlist.toggle(productId)
		} else if (button.hasAttribute('data-add-to-cart')) {
			const variant = selectedVariant(button)
			if (!Number.isFinite(variant.id) || variant.id <= 0) return
			const quantity = Math.max(
				1,
				Math.floor(Number(button.dataset.quantity) || 1)
			)
			await tiendu.cart.addProductVariant(
				variant,
				quantity,
				() => void syncCartBadge(),
				{
					title: button.dataset.title ?? '',
					currency: button.dataset.currency
				}
			)
		}
	} catch {
		// Overlays report their own errors; a failed action simply does nothing.
	}
})

void syncCartBadge()
