import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { AuthorizeRequest, AuthorizeResponse } from '../fields'
import { AuthorizeRole, AuthorizeState } from '../types'

export type DefaultAuthorizeTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: AuthorizeRole
  state: AuthorizeState
}

export type CustomAuthorizeTags = TagsBase

export type AuthorizeTags = RecordTags<AuthorizeRecord>

export interface AuthorizeStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: AuthorizeRole
  state: AuthorizeState
  request: AuthorizeRequest
  response?: AuthorizeResponse
  errorCode?: string
  errorDescription?: string
  tags?: CustomAuthorizeTags
}

/** One `https://didcomm.org/authorize/1.0` exchange, written on both sides. */
export class AuthorizeRecord extends BaseRecord<DefaultAuthorizeTags, CustomAuthorizeTags> {
  public static readonly type = 'AuthorizeRecord'
  public readonly type = AuthorizeRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: AuthorizeRole
  public state!: AuthorizeState

  /** The `request` as sent or received. */
  public request!: AuthorizeRequest

  /** The `response` as sent or received. */
  public response?: AuthorizeResponse

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: AuthorizeStorageProps) {
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

  public getTags(): DefaultAuthorizeTags & CustomAuthorizeTags {
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

  public assertState(expected: AuthorizeState | AuthorizeState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `authorize: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: AuthorizeRole): void {
    if (this.role !== expected) {
      throw new CredoError(`authorize: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
