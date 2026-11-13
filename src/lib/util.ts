export const esc = (s: unknown) => String(s ?? '')
export function when(t: number | undefined) {
  const n = Number(t)
  if (!isFinite(n) || n <= 0) return ''
  const s = (Date.now() - n) / 1000
  return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'
}
export const slug = () => Math.random().toString(36).slice(2, 10)
export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
export function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)) }
export function cleanTag(t: string) { return String(t || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 30) }
