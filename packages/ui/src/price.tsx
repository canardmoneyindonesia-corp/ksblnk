const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** 350000 -> "Rp 350.000" */
export function formatPrice(amount: number) {
  return rupiah.format(amount)
}

export function Price({ amount, className }: { amount: number; className?: string }) {
  return <span className={className}>{formatPrice(amount)}</span>
}
