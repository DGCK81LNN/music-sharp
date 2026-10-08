export function formatTime(sec: number): string {
  let s = Number.isFinite(sec) && sec > 0 ? sec : 0
  const m = Math.floor(s / 60)
  s -= m * 60
  const whole = Math.floor(s)
  const tenths = Math.floor((s - whole) * 10)
  return `${m}:${String(whole).padStart(2, '0')}.${tenths}`
}
