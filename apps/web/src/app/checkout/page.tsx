import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CheckoutView } from '@/components/CheckoutView'
import { getProducts } from '@/lib/products'

export const revalidate = 300
export const metadata: Metadata = { title: 'Bag', robots: { index: false } }

/**
 * Static too: the page ships the catalog (names, sizes, prices, photos) and
 * the bag is read from localStorage in the browser. The only server work is the
 * single POST /checkout to the API when the buyer taps "Pay" on step 2
 * (/checkout?step=shipping) — step 1 is the bag.
 */
export default async function CheckoutPage() {
  const products = await getProducts()
  return (
    <Suspense>
      <CheckoutView products={products} />
    </Suspense>
  )
}
