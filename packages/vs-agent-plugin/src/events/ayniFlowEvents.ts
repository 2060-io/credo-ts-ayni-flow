import { AuthorizeEventTypes, type AuthorizeStateChangedEvent } from '@ayni.org/credo-ts-didcomm-authorize'
import { AyniFlowEventTypes, type AyniFlowStateChangedEvent } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { ConfirmEventTypes, type ConfirmStateChangedEvent } from '@ayni.org/credo-ts-didcomm-confirm'
import { LinkSessionEventTypes, type LinkSessionStateChangedEvent } from '@ayni.org/credo-ts-didcomm-link-session'
import { NotifyEventTypes, type NotifyNotificationReceivedEvent } from '@ayni.org/credo-ts-didcomm-notify'
import {
  type PeerStatusAuthenticateReceivedEvent,
  PeerStatusEventTypes,
  type PeerStatusQueryReceivedEvent,
  type PeerStatusReceivedEvent,
} from '@ayni.org/credo-ts-didcomm-peer-status'
import { ReissueEventTypes, type ReissueStateChangedEvent } from '@ayni.org/credo-ts-didcomm-reissue'
import { SessionGrantEventTypes, type SessionGrantStateChangedEvent } from '@ayni.org/credo-ts-didcomm-session-grant'
import { SignTxEventTypes, type SignTxStateChangedEvent } from '@ayni.org/credo-ts-didcomm-sign-tx'
import type { BaseLogger } from '@credo-ts/core'
import type { VsAgent } from '@verana-labs/vs-agent-sdk'
import { emitModuleMessageEvent } from '@verana-labs/vs-agent-sdk'

import { toCarrierExchangeDto, toFlowDto } from '../nestjs/dto/index.js'

/** The webhook event types this plugin delivers (`type` of the webhook body; `data` is the flow or exchange DTO plus `previousState`). */
export const AYNI_FLOW_EVENT = {
  flowStateChanged: 'didcomm.ayni-flow.state-changed',
  authorizeStateChanged: 'didcomm.authorize.state-changed',
  confirmStateChanged: 'didcomm.confirm.state-changed',
  linkSessionStateChanged: 'didcomm.link-session.state-changed',
  sessionGrantStateChanged: 'didcomm.session-grant.state-changed',
  signTxStateChanged: 'didcomm.sign-tx.state-changed',
  reissueStateChanged: 'didcomm.reissue.state-changed',
  notificationReceived: 'didcomm.notify.notification-received',
  peerStatusReceived: 'didcomm.peer-status.status-received',
  peerStatusQueryReceived: 'didcomm.peer-status.query-received',
  peerStatusAuthenticateReceived: 'didcomm.peer-status.authenticate-received',
} as const

export type AyniFlowEventType = (typeof AYNI_FLOW_EVENT)[keyof typeof AYNI_FLOW_EVENT]

type CarrierStateChanged =
  | AuthorizeStateChangedEvent
  | ConfirmStateChangedEvent
  | LinkSessionStateChangedEvent
  | SessionGrantStateChangedEvent
  | SignTxStateChangedEvent
  | ReissueStateChangedEvent

/**
 * Relays the modules' Credo events to the controller as webhook events (CC-VSA-005). A flow that fails on a peer's
 * problem report arrives as `didcomm.ayni-flow.state-changed` with `state: failed`, `errorCode` and `closedBy: peer`
 * (CC-VSA-010).
 */
export const ayniFlowEvents = (agent: VsAgent<any>, logger: BaseLogger) => {
  agent.events.on(AyniFlowEventTypes.AyniFlowStateChanged, ({ payload }: AyniFlowStateChangedEvent) => {
    logger.debug(
      `[ayni-flow] flow ${payload.flowRecord.flowId}: ${payload.previousState ?? 'new'} -> ${payload.flowRecord.state}`
    )
    emitModuleMessageEvent(agent, AYNI_FLOW_EVENT.flowStateChanged, {
      ...toFlowDto(payload.flowRecord),
      previousState: payload.previousState,
    })
  })

  const carrier = (type: AyniFlowEventType, eventType: CarrierStateChanged['type']) => {
    agent.events.on(eventType, ({ payload }: CarrierStateChanged) => {
      emitModuleMessageEvent(agent, type, {
        ...toCarrierExchangeDto(payload.record),
        previousState: payload.previousState,
      })
    })
  }
  carrier(AYNI_FLOW_EVENT.authorizeStateChanged, AuthorizeEventTypes.AuthorizeStateChanged)
  carrier(AYNI_FLOW_EVENT.confirmStateChanged, ConfirmEventTypes.ConfirmStateChanged)
  carrier(AYNI_FLOW_EVENT.linkSessionStateChanged, LinkSessionEventTypes.LinkSessionStateChanged)
  carrier(AYNI_FLOW_EVENT.sessionGrantStateChanged, SessionGrantEventTypes.SessionGrantStateChanged)
  carrier(AYNI_FLOW_EVENT.signTxStateChanged, SignTxEventTypes.SignTxStateChanged)
  carrier(AYNI_FLOW_EVENT.reissueStateChanged, ReissueEventTypes.ReissueStateChanged)

  agent.events.on(NotifyEventTypes.NotifyNotificationReceived, ({ payload }: NotifyNotificationReceivedEvent) => {
    emitModuleMessageEvent(agent, AYNI_FLOW_EVENT.notificationReceived, {
      messageId: payload.message.id,
      connectionId: payload.connectionId,
      flowId: payload.parentThreadId,
      ...payload.notification,
    })
  })

  // peer-status (CC-VSA-012): what a peer says of this agent, and a peer asking where it stands
  agent.events.on(PeerStatusEventTypes.PeerStatusReceived, ({ payload }: PeerStatusReceivedEvent) => {
    emitModuleMessageEvent(agent, AYNI_FLOW_EVENT.peerStatusReceived, {
      messageId: payload.messageId,
      connectionId: payload.connectionId,
      status: payload.status,
      previous: payload.previous ?? null,
    })
  })
  agent.events.on(PeerStatusEventTypes.PeerStatusQueryReceived, ({ payload }: PeerStatusQueryReceivedEvent) => {
    emitModuleMessageEvent(agent, AYNI_FLOW_EVENT.peerStatusQueryReceived, {
      messageId: payload.messageId,
      connectionId: payload.connectionId,
      answered: payload.answered,
    })
  })
  // a peer asks to be asked for its credential (CC-VSA-013): the controller opens the `authenticate` flow
  agent.events.on(
    PeerStatusEventTypes.PeerStatusAuthenticateReceived,
    ({ payload }: PeerStatusAuthenticateReceivedEvent) => {
      emitModuleMessageEvent(agent, AYNI_FLOW_EVENT.peerStatusAuthenticateReceived, {
        messageId: payload.messageId,
        connectionId: payload.connectionId,
      })
    }
  )
}
