import Link from 'next/link'
import { CtaShape } from '@/components/CtaShape'

export default function NotFound() {
  return (
    <section className="notice">
      <h1>Not found.</h1>
      <p>This item may have been removed.</p>
      <Link href="/" className="btn btn--cta">
        <CtaShape />
        Back to the shop
      </Link>
    </section>
  )
}
