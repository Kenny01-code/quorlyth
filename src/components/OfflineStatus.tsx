import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!offline) return null
  return <div className="q-offline-status" role="status" aria-live="polite">
    <span aria-hidden="true" /> Offline mode <i>Cached workspace and saved chats are available. AI, live updates and shared changes need internet.</i>
  </div>
}
