import type { BaseEvent } from '@credo-ts/core'
import type { LinkSessionRecord } from './repository/LinkSessionRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum LinkSessionRole {
  Agent = 'agent',
  Holder = 'holder',
}

export enum LinkSessionState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Failed = 'failed',
}

export enum LinkSessionEventTypes {
  LinkSessionStateChanged = 'LinkSessionStateChanged',
}

/** Emitted on every state change of a `LinkSessionRecord`; `previousState` is null when the record is created. */
export interface LinkSessionStateChangedEvent extends BaseEvent {
  type: typeof LinkSessionEventTypes.LinkSessionStateChanged
  payload: {
    record: LinkSessionRecord
    previousState: LinkSessionState | null
  }
}
