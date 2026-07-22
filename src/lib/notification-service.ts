/** Browser notification service for critical study events. */
let permissionGranted = false

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') {
    permissionGranted = true
    return true
  }
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  permissionGranted = result === 'granted'
  return permissionGranted
}

export function sendNotification(title: string, body: string, tag?: string) {
  if (!permissionGranted || typeof Notification === 'undefined') return
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag })
  } catch {
    // Notification API not available
  }
}
