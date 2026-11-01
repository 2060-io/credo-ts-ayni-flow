import type { BaseEvent } from '@credo-ts/core'
import type { ConfirmRecord } from './repository/ConfirmRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum ConfirmRole {
  Requester = 'requester',
  Confirmer = 'confirmer',
}

export enum ConfirmState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ResponseSent = 'response-sent',
  ResponseReceived = 'response-received',
  Failed = 'failed',
}

export enum ConfirmEventTypes {
  ConfirmStateChanged = 'ConfirmStateChanged',
}

/** Emitted on every state change of a `ConfirmRecord`; `previousState` is null when the record is created. */
export interface ConfirmStateChangedEvent extends BaseEvent {
  type: typeof ConfirmEventTypes.ConfirmStateChanged
  payload: {
    record: ConfirmRecord
    previousState: ConfirmState | null
  }
}
