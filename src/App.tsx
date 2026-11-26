import { useEffect, useRef } from 'react'
import markup from './game/markup.html?raw'
import { mountGame } from './game/controller.js'
import OfflineStatus from './OfflineStatus'

export default function App() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = container.current
    if (!root) return

    // This is the versioned game template, never user or saved-game content.
    // React owns the host; the original controller owns its descendants.
    root.innerHTML = markup
    const dispose = mountGame(root, import.meta.env.BASE_URL)
    return () => {
      dispose()
      root.replaceChildren()
    }
  }, [])

  return <><div ref={container} className="scoundrel-game" /><OfflineStatus /></>
}
