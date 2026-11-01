import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { ReissueRequest } from '../fields'
import { ReissueRole, ReissueState } from '../types'

export type DefaultReissueTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
  parentThreadId?: string
  connectionId: string
  role: ReissueRole
  state: ReissueState
}

export type CustomReissueTags = TagsBase

export type ReissueTags = RecordTags<ReissueRecord>

export interface ReissueStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: ReissueRole
  state: ReissueState
  request: ReissueRequest
  errorCode?: string
  errorDescription?: string
  tags?: CustomReissueTags
}

/** One `https://didcomm.org/reissue/1.0` exchange, written on both sides. */
export class ReissueRecord extends BaseRecord<DefaultReissueTags, CustomReissueTags> {
  public static readonly type = 'ReissueRecord'
  public readonly type = ReissueRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: ReissueRole
  public state!: ReissueState

  /** The `request` as sent or received. */
  public request!: ReissueRequest

  /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: ReissueStorageProps) {
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
      this.errorCode = props.errorCode
      this.errorDescription = props.errorDescription
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultReissueTags & CustomReissueTags {
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

  public assertState(expected: ReissueState | ReissueState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `reissue: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: ReissueRole): void {
    if (this.role !== expected) {
      throw new CredoError(`reissue: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
