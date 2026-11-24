import { CredoError } from '@credo-ts/core'

import type { AyniFlowState } from './types'

/**
 * A flow is closed (or past its `expires_time`): nothing more is sent in it (FLOW-CORE-005). Thrown when a carrier
 * message with the flow's `pthid` is sent after the close, and when a closed flow is closed again.
 */
export class AyniFlowClosedError extends CredoError {
  /** 409 Conflict, for a host that answers over HTTP: VS Agent's Admin API answers `409 INVALID_STATE` with the message. */
  public readonly status = 409

  public constructor(
    public readonly flowId: string,
    public readonly state: AyniFlowState,
    /** What was refused, for example the type of the carrier message that was not sent. */
    detail?: string
  ) {
    super(`ayni-flow: flow '${flowId}' is already closed (${state})${detail ? `: ${detail}` : ''}`)
    this.name = 'AyniFlowClosedError'
  }
}

/**
 * A flow of this kind is already open on the connection, and the profile allows one at a time: a service keeps at most
 * one `authenticate` flow pending on a connection (§6.14, FLOW-SIGNIN-001).
 */
export class AyniFlowAlreadyOpenError extends CredoError {
  /** 409 Conflict, for a host that answers over HTTP, as `AyniFlowClosedError`. */
  public readonly status = 409

  public constructor(
    /** The flow that is still open. */
    public readonly flowId: string,
    public readonly kind: string
  ) {
    super(`ayni-flow: a flow of kind '${kind}' is already open on the connection ('${flowId}'); close it first`)
    this.name = 'AyniFlowAlreadyOpenError'
  }
}
