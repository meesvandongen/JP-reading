import { signal } from '@preact/signals'

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/'
  const [path, qs] = raw.split('?')
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs ?? '') }
}

export const route = signal<Route>(parse())

// In-app history, so a "back" button never leaves the app
const stack: string[] = [route.value.path]
window.addEventListener('hashchange', () => {
  route.value = parse()
  const p = route.value.path
  if (stack.length > 1 && stack[stack.length - 2] === p) stack.pop()
  else stack.push(p)
})

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`
  if (opts.replace) {
    history.replaceState(null, '', url)
    route.value = parse()
    stack[stack.length - 1] = route.value.path
  } else {
    location.hash = path
  }
}

export function back(fallback = '/') {
  if (stack.length > 1) history.back()
  else navigate(fallback, { replace: true })
}
