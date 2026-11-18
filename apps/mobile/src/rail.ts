import { mountRail } from '../../../packages/native-shell/rail'

// Each app gives this page one channel of its own, which no Server's page has.
type Channel = { postMessage: (message: string) => void }
const channel = (window as unknown as { zugoidRail?: Channel }).zugoidRail
  ?? (window as unknown as { webkit?: { messageHandlers?: { zugoidRail?: Channel } } }).webkit?.messageHandlers?.zugoidRail
const send = (message: object) => channel?.postMessage(JSON.stringify(message))

mountRail({
  open: origin => send({ type: 'open', origin }),
  showList: () => send({ type: 'list' }),
  ready: () => send({ type: 'ready' }),
})
