import { sendToAgentChatAndConfirm } from '@agent-native/core/client/agent-chat'

type HandOff = Omit<Parameters<typeof sendToAgentChatAndConfirm>[0], 'chatTarget'>

// Blueprint sheet handoffs need reliable arrival when the panel is still mounting.
// Dispatches with delivery confirmation and falls back to a single retry if unacknowledged.
export async function sendToAgent(opts: HandOff): Promise<boolean> {
  const first = await sendToAgentChatAndConfirm({ ...opts, chatTarget: 'local' }, { timeoutMs: 2500 })
  if (first.delivered) return true
  const second = await sendToAgentChatAndConfirm({ ...opts, chatTarget: 'local' }, { timeoutMs: 6000 })
  return second.delivered
}
