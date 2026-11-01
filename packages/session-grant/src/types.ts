import type { BaseEvent } from '@credo-ts/core'
import type { SessionGrantRecord } from './repository/SessionGrantRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum SessionGrantRole {
  Requester = 'requester',
  Agent = 'agent',
}

export enum SessionGrantState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Failed = 'failed',
}

export enum SessionGrantEventTypes {
  SessionGrantStateChanged = 'SessionGrantStateChanged',
}

/** Emitted on every state change of a `SessionGrantRecord`; `previousState` is null when the record is created. */
export interface SessionGrantStateChangedEvent extends BaseEvent {
  type: typeof SessionGrantEventTypes.SessionGrantStateChanged
  payload: {
    record: SessionGrantRecord
    previousState: SessionGrantState | null
  }
}
