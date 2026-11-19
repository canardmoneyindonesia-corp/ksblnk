/** 93784000 -> "1d 02:03:04", 3784000 -> "01:03:04" */
export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${d ? `${d}d ` : ''}${hh}:${mm}:${ss}`
}
