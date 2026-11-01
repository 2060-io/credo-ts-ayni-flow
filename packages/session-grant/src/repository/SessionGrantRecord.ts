import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { SessionGrantRequest, SessionGrantResponse } from '../fields'
import { SessionGrantRole, SessionGrantState } from '../types'

export type DefaultSessionGrantTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: SessionGrantRole
  state: SessionGrantState
}

export type CustomSessionGrantTags = TagsBase

export type SessionGrantTags = RecordTags<SessionGrantRecord>

export interface SessionGrantStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: SessionGrantRole
  state: SessionGrantState
  request: SessionGrantRequest
  response?: SessionGrantResponse
  errorCode?: string
  errorDescription?: string
  tags?: CustomSessionGrantTags
}

/** One `https://didcomm.org/session-grant/1.0` exchange, written on both sides. */
export class SessionGrantRecord extends BaseRecord<DefaultSessionGrantTags, CustomSessionGrantTags> {
  public static readonly type = 'SessionGrantRecord'
  public readonly type = SessionGrantRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: SessionGrantRole
  public state!: SessionGrantState

  /** The `request` as sent or received. */
  public request!: SessionGrantRequest

  /** The `grant` as sent or received. */
  public response?: SessionGrantResponse

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: SessionGrantStorageProps) {
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

  public getTags(): DefaultSessionGrantTags & CustomSessionGrantTags {
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

  public assertState(expected: SessionGrantState | SessionGrantState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `session-grant: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: SessionGrantRole): void {
    if (this.role !== expected) {
      throw new CredoError(`session-grant: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
