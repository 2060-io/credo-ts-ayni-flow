import type { BaseEvent } from '@credo-ts/core'
import type { SignTxRecord } from './repository/SignTxRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum SignTxRole {
  Requester = 'requester',
  Signer = 'signer',
}

export enum SignTxState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Failed = 'failed',
}

export enum SignTxEventTypes {
  SignTxStateChanged = 'SignTxStateChanged',
}

/** Emitted on every state change of a `SignTxRecord`; `previousState` is null when the record is created. */
export interface SignTxStateChangedEvent extends BaseEvent {
  type: typeof SignTxEventTypes.SignTxStateChanged
  payload: {
    record: SignTxRecord
    previousState: SignTxState | null
  }
}
