import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { ConfirmRequest, ConfirmResponse } from '../fields'
import { ConfirmRole, ConfirmState } from '../types'

export type DefaultConfirmTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: ConfirmRole
  state: ConfirmState
}

export type CustomConfirmTags = TagsBase

export type ConfirmTags = RecordTags<ConfirmRecord>

export interface ConfirmStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: ConfirmRole
  state: ConfirmState
  request: ConfirmRequest
  response?: ConfirmResponse
  errorCode?: string
  errorDescription?: string
  tags?: CustomConfirmTags
}

/** One `https://didcomm.org/confirm/1.0` exchange, written on both sides. */
export class ConfirmRecord extends BaseRecord<DefaultConfirmTags, CustomConfirmTags> {
  public static readonly type = 'ConfirmRecord'
  public readonly type = ConfirmRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: ConfirmRole
  public state!: ConfirmState

  /** The `request` as sent or received. */
  public request!: ConfirmRequest

  /** The `response` as sent or received. */
  public response?: ConfirmResponse

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: ConfirmStorageProps) {
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

  public getTags(): DefaultConfirmTags & CustomConfirmTags {
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

  public assertState(expected: ConfirmState | ConfirmState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `confirm: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: ConfirmRole): void {
    if (this.role !== expected) {
      throw new CredoError(`confirm: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
