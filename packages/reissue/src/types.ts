import type { BaseEvent } from '@credo-ts/core'
import type { ReissueRecord } from './repository/ReissueRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3). */
export enum ReissueRole {
  Requester = 'requester',
  Issuer = 'issuer',
}

export enum ReissueState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  /** The issuer opened the `issue` flow, or sent the problem report, that answers the request. */
  Answered = 'answered',
  Failed = 'failed',
}

export enum ReissueEventTypes {
  ReissueStateChanged = 'ReissueStateChanged',
}

/** Emitted on every state change of a `ReissueRecord`; `previousState` is null when the record is created. */
export interface ReissueStateChangedEvent extends BaseEvent {
  type: typeof ReissueEventTypes.ReissueStateChanged
  payload: {
    record: ReissueRecord
    previousState: ReissueState | null
  }
}
