import { useEffect, useState } from 'react'

export default function OfflineStatus() {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [update, setUpdate] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    const listeners = new AbortController()
    let disposed = false
    const signal = listeners.signal

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register(
          `${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' },
        )
        if (disposed) return
        const checkUpdate = () => setUpdate(Boolean(registration.waiting))
        const watchInstall = () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            checkUpdate()
            if (worker.state === 'redundant' && !registration.active) setFailed(true)
          }, { signal })
        }
        checkUpdate()
        watchInstall()
        registration.addEventListener('updatefound', watchInstall, { signal })
        const active = (await navigator.serviceWorker.ready).active
        const complete = await new Promise<boolean>(resolve => {
          if (!active) return resolve(false)
          const channel = new MessageChannel()
          const timer = window.setTimeout(() => { channel.port1.close(); resolve(false) }, 5000)
          channel.port1.onmessage = event => {
            window.clearTimeout(timer)
            channel.port1.close()
            resolve(event.data?.app === 'scoundrel' && event.data.ready === true)
          }
          active.postMessage({ type: 'SCOUNDREL_STATUS' }, [channel.port2])
        })
        if (!disposed) {
          setReady(complete)
          setFailed(!complete)
        }
      } catch (error) {
        console.error('Offline setup failed:', error)
        if (!disposed) setFailed(true)
      }
    }
    void register()
    return () => {
      disposed = true
      listeners.abort()
    }
  }, [])

  if (!import.meta.env.PROD) return null
  const supported = 'serviceWorker' in navigator
  const message = !supported ? 'Offline play is unavailable in this browser.'
    : failed ? 'Offline setup failed. Reconnect and try repairing.'
    : !ready ? 'Preparing offline play…'
    : 'Ready to play offline'

  return <div className="offline-status">
    <p role="status" aria-live="polite" aria-atomic="true">
      {ready && !failed && <span className="offline-status-dot" aria-hidden="true" />}
      {message}
    </p>
    {failed && <a href={`${import.meta.env.BASE_URL}recover.html`}>Repair offline play</a>}
    <p className="offline-update" role="status" aria-live="polite" aria-atomic="true">
      {update && 'Update ready. Close all game windows and reopen to update.'}
    </p>
  </div>
}
