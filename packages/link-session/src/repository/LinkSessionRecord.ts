import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { LinkSessionRequest, LinkSessionResponse } from '../fields'
import { LinkSessionRole, LinkSessionState } from '../types'

export type DefaultLinkSessionTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: LinkSessionRole
  state: LinkSessionState
}

export type CustomLinkSessionTags = TagsBase

export type LinkSessionTags = RecordTags<LinkSessionRecord>

export interface LinkSessionStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: LinkSessionRole
  state: LinkSessionState
  request: LinkSessionRequest
  response?: LinkSessionResponse
  errorCode?: string
  errorDescription?: string
  tags?: CustomLinkSessionTags
}

/** One `https://didcomm.org/link-session/1.0` exchange, written on both sides. */
export class LinkSessionRecord extends BaseRecord<DefaultLinkSessionTags, CustomLinkSessionTags> {
  public static readonly type = 'LinkSessionRecord'
  public readonly type = LinkSessionRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: LinkSessionRole
  public state!: LinkSessionState

  /** The `request` as sent or received. */
  public request!: LinkSessionRequest

  /** The `response` as sent or received. */
  public response?: LinkSessionResponse

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: LinkSessionStorageProps) {
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

  public getTags(): DefaultLinkSessionTags & CustomLinkSessionTags {
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

  public assertState(expected: LinkSessionState | LinkSessionState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `link-session: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: LinkSessionRole): void {
    if (this.role !== expected) {
      throw new CredoError(`link-session: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
