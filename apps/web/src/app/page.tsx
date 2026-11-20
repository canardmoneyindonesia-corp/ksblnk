import { Price } from '@kskblnk/ui'
import Image from 'next/image'
import Link from 'next/link'
import { BagSheet } from '@/components/BagSheet'
import { CardStatus } from '@/components/CardStatus'
import { MusicCard } from '@/components/MusicCard'
import { QuickAdd } from '@/components/QuickAdd'
import { getProducts } from '@/lib/products'

// Static HTML, regenerated in the background at most every 5 min (or on CMS publish).
export const revalidate = 300

export default async function HomePage() {
  const products = await getProducts()

  if (!products.length) {
    return <p className="empty">Nothing here yet. Next drop soon.</p>
  }

  return (
    <>
    <ul className="grid">
      {products.map((p, i) => {
        const img = p.images[0]
        return (
          <li key={p.id} className="grid__item">
            {/* The "+" sits beside the link, not inside it: a button can't live inside an <a>. */}
            <QuickAdd id={p.id} name={p.name} variants={p.variants} dropAt={p.dropAt} />
            <Link href={`/p/${p.slug}`} className="card">
              <div className="card__media">
                {img && (
                  <Image
                    src={img.url}
                    alt={img.alt || p.name}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    priority={i < 4}
                  />
                )}
                <CardStatus skus={p.variants.map((v) => v.sku)} dropAt={p.dropAt} />
              </div>
              <div className="card__info">
                <span className="card__name">{p.name}</span>
                <Price amount={p.price} className="card__price" />
              </div>
            </Link>
          </li>
        )
      })}
      {/* Pinned to the right column, 2nd row via CSS (.grid__item--music). */}
      <li className="grid__item grid__item--music">
        <MusicCard
          src="/music/kurang-riset.mp3"
          video="/fx/gaya-hidup.mp4"
          poster="/fx/gaya-hidup.jpg"
          title="Kurang Riset"
          artist="Quest, Basboi & Wicigo Shawty"
        />
      </li>
    </ul>
    <BagSheet products={products} />
    </>
  )
}
