import { useLayoutEffect, useState } from 'react'

// Deduplicates dual-mount statutory redline widgets emitted for the same tool invocation.
// The initial component instance reserves the widget id token, suppressing subsequent duplicates.
const claims = new Map<string, symbol>()

export function useSingleChatCard(widgetId: string | undefined): boolean {
  const [token] = useState(() => Symbol('chat-card'))
  const [visible, setVisible] = useState(true)
  useLayoutEffect(() => {
    if (!widgetId) return
    const owner = claims.get(widgetId)
    if (owner && owner !== token) {
      setVisible(false)
      return
    }
    claims.set(widgetId, token)
    return () => {
      if (claims.get(widgetId) === token) claims.delete(widgetId)
    }
  }, [widgetId, token])
  return visible
}
