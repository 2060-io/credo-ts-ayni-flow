import type { DidcommModule } from '@verana-labs/vs-agent-sdk'

/** The message-type prefixes each module serves, listed by `GET /v2/didcomm/protocols`. */
export const AYNI_FLOW_DIDCOMM_MODULES: readonly DidcommModule[] = [
  { module: 'ayni-flow', prefixes: ['https://didcomm.org/ayni-flow/', 'https://didcomm.org/report-problem/'] },
  { module: 'authorize', prefixes: ['https://didcomm.org/authorize/'] },
  { module: 'confirm', prefixes: ['https://didcomm.org/confirm/'] },
  { module: 'link-session', prefixes: ['https://didcomm.org/link-session/'] },
  { module: 'session-grant', prefixes: ['https://didcomm.org/session-grant/'] },
  { module: 'sign-tx', prefixes: ['https://didcomm.org/sign-tx/'] },
  { module: 'notify', prefixes: ['https://didcomm.org/notify/'] },
  { module: 'reissue', prefixes: ['https://didcomm.org/reissue/'] },
]
