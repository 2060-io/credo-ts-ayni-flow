import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { SignTxRequest, SignTxResponse } from '../fields'
import { SignTxRole, SignTxState } from '../types'

export type DefaultSignTxTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: SignTxRole
  state: SignTxState
}

export type CustomSignTxTags = TagsBase

export type SignTxTags = RecordTags<SignTxRecord>

export interface SignTxStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: SignTxRole
  state: SignTxState
  request: SignTxRequest
  response?: SignTxResponse
  errorCode?: string
  errorDescription?: string
  tags?: CustomSignTxTags
}

/** One `https://didcomm.org/sign-tx/1.0` exchange, written on both sides. */
export class SignTxRecord extends BaseRecord<DefaultSignTxTags, CustomSignTxTags> {
  public static readonly type = 'SignTxRecord'
  public readonly type = SignTxRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: SignTxRole
  public state!: SignTxState

  /** The `request` as sent or received. */
  public request!: SignTxRequest

  /** The `response` as sent or received. */
  public response?: SignTxResponse

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: SignTxStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.threadId = props.threadId
      this.parentThreadId = props.parentThreadId
      this.connectionId = props.connectionId
      this.role = props.role
      this.state = props.state
      this.request = props.request
      this.response = props.response
      this.errorCode = props.errorCode
      this.errorDescription = props.errorDescription
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultSignTxTags & CustomSignTxTags {
    return {
      ...this._tags,
      threadId: this.threadId,
      parentThreadId: this.parentThreadId,
      connectionId: this.connectionId,
      role: this.role,
      state: this.state,
    }
  }

  /** The flow id, when the exchange runs inside an ayni-flow. */
  public get flowId(): string | undefined {
    return this.parentThreadId
  }

  public assertState(expected: SignTxState | SignTxState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `sign-tx: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: SignTxRole): void {
    if (this.role !== expected) {
      throw new CredoError(`sign-tx: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
