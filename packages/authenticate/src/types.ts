import type { BaseEvent } from '@credo-ts/core'

import type { EnrolChallenge, Unenrol } from './fields'
import type { AuthenticateRecord } from './repository/AuthenticateRecord'
import type { EnrolRecord } from './repository/EnrolRecord'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3): the holder `authenticator`, a service `requester`. */
export enum AuthenticateRole {
  Requester = 'requester',
  Authenticator = 'authenticator',
}

/**
 * The state of an authentication exchange, by the last message sent or received. A step sent again (after a wrong code)
 * or a second step keeps the record in the same states; `steps` on the record says which step.
 */
export enum AuthenticateState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ChoiceSent = 'choice-sent',
  ChoiceReceived = 'choice-received',
  StepSent = 'step-sent',
  StepReceived = 'step-received',
  AnswerSent = 'answer-sent',
  AnswerReceived = 'answer-received',
  StepResultSent = 'step-result-sent',
  StepResultReceived = 'step-result-received',
  Failed = 'failed',
}

/** The state of an enrolment exchange (profile §6.4). */
export enum EnrolState {
  RequestSent = 'request-sent',
  RequestReceived = 'request-received',
  ChallengeSent = 'challenge-sent',
  ChallengeReceived = 'challenge-received',
  AnswerSent = 'answer-sent',
  AnswerReceived = 'answer-received',
  Failed = 'failed',
}

export enum AuthenticateEventTypes {
  AuthenticateStateChanged = 'AuthenticateStateChanged',
  EnrolStateChanged = 'AuthenticateEnrolStateChanged',
  UnenrolReceived = 'AuthenticateUnenrolReceived',
}

/** Emitted on every message of an authentication exchange; `previousState` is null when the record is created. */
export interface AuthenticateStateChangedEvent extends BaseEvent {
  type: typeof AuthenticateEventTypes.AuthenticateStateChanged
  payload: {
    record: AuthenticateRecord
    previousState: AuthenticateState | null
  }
}

/**
 * Emitted on every message of an enrolment exchange; `previousState` is null when the record is created. With
 * `challenge-sent` and `challenge-received`, `challenge` is the challenge in full: the record keeps an authenticator
 * app's challenge without its secret, which the holder shows once and the service keeps sealed (agent D129). A
 * challenge sent again after a wrong code carries `error: 'wrong-code'` and `triesLeft` (the codes left), in the event
 * and on the record's `challenge`: the holder shows "That code was not right" with the tries left.
 */
export interface EnrolStateChangedEvent extends BaseEvent {
  type: typeof AuthenticateEventTypes.EnrolStateChanged
  payload: {
    record: EnrolRecord
    previousState: EnrolState | null
    challenge?: EnrolChallenge
  }
}

/** Emitted for every `unenrol` received: the service removes the method and answers with a peer status (§6.4). */
export interface UnenrolReceivedEvent extends BaseEvent {
  type: typeof AuthenticateEventTypes.UnenrolReceived
  payload: {
    /** The type removed. */
    type: Unenrol['type']
    connectionId: string
    messageId: string
  }
}
