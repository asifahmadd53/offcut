export const dayMonth = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const timeOfDay = (ms: number) =>
  new Date(ms)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}
