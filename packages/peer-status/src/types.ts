import type { BaseEvent } from '@credo-ts/core'

import type { PeerStatus } from './fields'

export * from './fields'

/**
 * The protocol roles disclosed through discover-features (profile §3). The notifier tells, the receiver is told.
 * The protocol is symmetric (FLOW-STAT-008): the Ayni app is a `receiver`, a service a `notifier`, and a service
 * that talks to another service holds both.
 */
export enum PeerStatusRole {
  Notifier = 'notifier',
  Receiver = 'receiver',
}

export enum PeerStatusEventTypes {
  PeerStatusReceived = 'PeerStatusReceived',
  PeerStatusQueryReceived = 'PeerStatusQueryReceived',
}

/** Emitted for every `status` received; the status replaces `previous` (FLOW-STAT-005). */
export interface PeerStatusReceivedEvent extends BaseEvent {
  type: typeof PeerStatusEventTypes.PeerStatusReceived
  payload: {
    connectionId: string
    status: PeerStatus
    /** The status of the connection before this one; undefined for the first. */
    previous?: PeerStatus
    messageId: string
  }
}

/**
 * Emitted for every `query` received. `answered` tells whether the module sent the status it holds for the
 * connection; when it holds none, the first status the host sends is the answer (FLOW-STAT-006).
 */
export interface PeerStatusQueryReceivedEvent extends BaseEvent {
  type: typeof PeerStatusEventTypes.PeerStatusQueryReceived
  payload: {
    connectionId: string
    answered: boolean
    messageId: string
  }
}
