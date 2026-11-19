import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="notice">
      <h1>Not found.</h1>
      <p>This item may have been removed.</p>
      <Link href="/" className="btn btn--primary">
        Back to the shop
      </Link>
    </section>
  )
}
