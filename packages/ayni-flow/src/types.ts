import type { BaseEvent } from '@credo-ts/core'
import type { AyniFlowRecord } from './repository/AyniFlowRecord'

/** The party this agent is in the profile (§1): the holder is the Ayni app, the service a Verifiable Service. */
export enum AyniFlowRole {
  Holder = 'holder',
  Service = 'service',
}

/** Lifecycle of a flow (profile §5.2). The five closed states are the `close.outcome` values. */
export enum AyniFlowState {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
  Declined = 'declined',
  Cancelled = 'cancelled',
  Failed = 'failed',
  Expired = 'expired',
}

export const AYNI_FLOW_OUTCOMES = ['completed', 'declined', 'cancelled', 'failed', 'expired'] as const
export type AyniFlowOutcome = (typeof AYNI_FLOW_OUTCOMES)[number]

export function isAyniFlowClosedState(state: AyniFlowState): boolean {
  return state !== AyniFlowState.Pending && state !== AyniFlowState.Active
}

/** The kinds of profile §6; the registry is open-ended, so APIs accept any string. */
export enum AyniFlowKind {
  Present = 'present',
  Issue = 'issue',
  NfcRead = 'nfc-read',
  Call = 'call',
  Authorize = 'authorize',
  Confirm = 'confirm',
  LinkSession = 'link-session',
  SessionGrant = 'session-grant',
  SignTx = 'sign-tx',
  Notify = 'notify',
  Reissue = 'reissue',
  Revoked = 'revoked',
  IdentifyUa = 'identify-ua',
}

/** Kinds the holder answers by default: every kind of §6 but `identify-ua`, deferred with app D8 (matrix row 28). */
export const DEFAULT_HOLDER_KINDS: readonly string[] = Object.values(AyniFlowKind).filter(
  (kind) => kind !== AyniFlowKind.IdentifyUa
)

/** Kinds a service accepts from a holder: the holder-initiated ones (§6: `session-grant`, `reissue`, the `present` proposal). */
export const DEFAULT_SERVICE_KINDS: readonly string[] = [
  AyniFlowKind.SessionGrant,
  AyniFlowKind.Reissue,
  AyniFlowKind.Present,
]

/** `description.code` values of profile §11. */
export enum AyniFlowErrorCode {
  UnsupportedKind = 'unsupported-kind',
  Malformed = 'malformed',
  Expired = 'expired',
  Declined = 'declined',
  UntrustedVerifier = 'untrusted-verifier',
  UntrustedIssuer = 'untrusted-issuer',
  Untrusted = 'untrusted',
  TooManyFlows = 'too-many-flows',
  SummaryMismatch = 'summary-mismatch',
  WrongChain = 'wrong-chain',
  ReadFailed = 'read-failed',
  FaceMatchFailed = 'face-match-failed',
  NotEligible = 'not-eligible',
  UnknownReference = 'unknown-reference',
  NotAccepted = 'not-accepted',
  NotFlowCapable = 'not-flow-capable',
}

/** Who closed the flow, kept on the record for History. */
export enum AyniFlowClosedBy {
  Me = 'me',
  Peer = 'peer',
  Expiry = 'expiry',
}

export enum AyniFlowEventTypes {
  AyniFlowStateChanged = 'AyniFlowStateChanged',
}

/** Emitted on every state change of an `AyniFlowRecord`; `previousState` is null when the record is created. */
export interface AyniFlowStateChangedEvent extends BaseEvent {
  type: typeof AyniFlowEventTypes.AyniFlowStateChanged
  payload: {
    flowRecord: AyniFlowRecord
    previousState: AyniFlowState | null
  }
}
