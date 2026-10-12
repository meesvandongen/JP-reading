import { signal } from '@preact/signals'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const installPrompt = signal<BeforeInstallPromptEvent | null>(null)
export const updateAvailable = signal<null | (() => void)>(null)
export const offlineReady = signal(false)
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt.value = e as BeforeInstallPromptEvent
})
window.addEventListener('appinstalled', () => (installPrompt.value = null))
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))

export async function promptInstall() {
  const p = installPrompt.value
  if (!p) return
  await p.prompt()
  await p.userChoice
  installPrompt.value = null
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export async function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const { registerSW } = await import('virtual:pwa-register')
  const update = registerSW({
    onNeedRefresh() {
      updateAvailable.value = () => update(true)
    },
    onOfflineReady() {
      offlineReady.value = true
    },
    onRegisteredSW(_url, reg) {
      // check for updates hourly while the app is open
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
}
