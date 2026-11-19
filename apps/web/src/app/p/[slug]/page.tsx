import { Price } from '@kskblnk/ui'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { BuyBox } from '@/components/BuyBox'
import { getProduct, getProducts } from '@/lib/products'

export const revalidate = 300
// A product published after the last build is generated on first visit, then cached.
export const dynamicParams = true

export async function generateStaticParams() {
  return (await getProducts()).map((p) => ({ slug: p.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug)
  if (!p) return {}
  return {
    title: p.name,
    description: p.description.slice(0, 160),
    openGraph: { images: p.images[0] ? [p.images[0].url] : [] },
  }
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug)
  if (!product) notFound()

  return (
    <article className="pdp">
      <div className="pdp__media">
        <BackButton />
        <div className="gallery" aria-label="Product photos">
          {product.images.map((img, i) => (
            <div className="gallery__slide" key={img.url}>
              <Image
                src={img.url}
                alt={img.alt || product.name}
                fill
                sizes="(max-width: 900px) 100vw, 50vw"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="pdp__info">
        <h1 className="pdp__name">{product.name}</h1>
        <Price amount={product.price} className="pdp__price" />
        <BuyBox variants={product.variants} dropAt={product.dropAt} />
        {product.description && <p className="pdp__desc">{product.description}</p>}
      </div>
    </article>
  )
}
