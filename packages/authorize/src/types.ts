import type { BaseEvent } from '@credo-ts/core'
import type { AuthorizeRecord } from './repository/AuthorizeRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum AuthorizeRole {
  Requester = 'requester',
  Approver = 'approver',
}

export enum AuthorizeState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Failed = 'failed',
}

export enum AuthorizeEventTypes {
  AuthorizeStateChanged = 'AuthorizeStateChanged',
}

/** Emitted on every state change of a `AuthorizeRecord`; `previousState` is null when the record is created. */
export interface AuthorizeStateChangedEvent extends BaseEvent {
  type: typeof AuthorizeEventTypes.AuthorizeStateChanged
  payload: {
    record: AuthorizeRecord
    previousState: AuthorizeState | null
  }
}
