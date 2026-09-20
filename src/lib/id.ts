/** Short unique id. Made on the phone, so it works offline and never clashes between phones. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

const DEVICE_KEY = 'sc-device-id'

/** Identifies this phone, used to say "used on another phone" in sync warnings. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = uid()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'unknown-device'
  }
}
