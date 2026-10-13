import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { loadAll } from './state/db'
import { loadLibrary } from './services/library'
import { registerSW } from './services/pwa'
import { scheduleInAppReminder } from './services/reminders'
import { pendingImport } from './pages/ImportPage'
import { navigate } from './router'

// Share target (GET ?share_text=…) → import page
const params = new URLSearchParams(location.search)
if (params.has('share_text') || params.has('share_title') || params.has('share_url')) {
  const text = [params.get('share_text'), params.get('share_url')].filter(Boolean).join('\n')
  pendingImport.title = params.get('share_title') ?? undefined
  pendingImport.text = text
  history.replaceState(null, '', location.pathname + '#/import')
  navigate('/import', { replace: true })
}

// File handler (open .txt with the installed app)
const lq = (window as Window & { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue
lq?.setConsumer(async ({ files }) => {
  const f = files?.[0]
  if (!f) return
  const file = await f.getFile()
  pendingImport.title = file.name.replace(/\.(txt|md)$/i, '')
  pendingImport.text = await file.text()
  navigate('/import')
})

render(<App />, document.getElementById('app')!)
loadAll().then(scheduleInAppReminder)
loadLibrary()
registerSW()
