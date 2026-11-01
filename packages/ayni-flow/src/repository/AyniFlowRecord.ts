import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'
import { Type } from 'class-transformer'

import type { AyniFlowOriginOptions, AyniFlowReferenceOptions, AyniFlowStepOptions } from '../models'
import { AyniFlowClosedBy, AyniFlowRole, AyniFlowState, isAyniFlowClosedState } from '../types'

export type DefaultAyniFlowTags = {
  /** The flow id, the `@id` of the `open`. */
  threadId: string
  connectionId: string
  role: AyniFlowRole
  kind: string
  flowState: AyniFlowState
  openedByMe: boolean
}

export type CustomAyniFlowTags = TagsBase

export type AyniFlowTags = RecordTags<AyniFlowRecord>

export interface AyniFlowStorageProps {
  id?: string
  createdAt?: Date

  threadId: string
  connectionId: string
  role: AyniFlowRole
  openedByMe: boolean
  state: AyniFlowState

  kind: string
  title: string
  description?: string
  origin: AyniFlowOriginOptions
  expiresTime: Date
  requires?: string[]
  steps?: AyniFlowStepOptions[]

  reason?: string
  references?: AyniFlowReferenceOptions[]
  errorCode?: string
  closedAt?: Date
  closedBy?: AyniFlowClosedBy

  tags?: CustomAyniFlowTags
}

/** One flow (profile §5), written on both sides; the holder's History entry of §5.3 is this record. */
export class AyniFlowRecord extends BaseRecord<DefaultAyniFlowTags, CustomAyniFlowTags> {
  public static readonly type = 'AyniFlowRecord'
  public readonly type = AyniFlowRecord.type

  /** The flow id: the `@id` of the `open`, the `~thread.pthid` of every message of the flow. */
  public threadId!: string
  public connectionId!: string
  public role!: AyniFlowRole
  public openedByMe!: boolean
  public state!: AyniFlowState

  public kind!: string
  public title!: string
  public description?: string
  public origin!: AyniFlowOriginOptions

  @Type(() => Date)
  public expiresTime!: Date

  public requires?: string[]
  public steps?: AyniFlowStepOptions[]

  /** `close.reason`, or the `description.en` of the problem report that failed the flow. */
  public reason?: string
  public references?: AyniFlowReferenceOptions[]
  /** `description.code` of the problem report that failed the flow (profile §11). */
  public errorCode?: string

  @Type(() => Date)
  public closedAt?: Date

  public closedBy?: AyniFlowClosedBy

  public constructor(props: AyniFlowStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.threadId = props.threadId
      this.connectionId = props.connectionId
      this.role = props.role
      this.openedByMe = props.openedByMe
      this.state = props.state
      this.kind = props.kind
      this.title = props.title
      this.description = props.description
      this.origin = props.origin
      this.expiresTime = props.expiresTime
      this.requires = props.requires
      this.steps = props.steps
      this.reason = props.reason
      this.references = props.references
      this.errorCode = props.errorCode
      this.closedAt = props.closedAt
      this.closedBy = props.closedBy
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultAyniFlowTags & CustomAyniFlowTags {
    return {
      ...this._tags,
      threadId: this.threadId,
      connectionId: this.connectionId,
      role: this.role,
      kind: this.kind,
      flowState: this.state,
      openedByMe: this.openedByMe,
    }
  }

  /** The flow id, under the name the profile uses. */
  public get flowId(): string {
    return this.threadId
  }

  public get isClosed(): boolean {
    return isAyniFlowClosedState(this.state)
  }

  public isExpiredAt(now: Date = new Date()): boolean {
    return this.expiresTime.getTime() <= now.getTime()
  }

  /** Whether the party that must send `completed` or `failed` is us (profile §5.2: the opener closes the carrier's end). */
  public get isOpener(): boolean {
    return this.openedByMe
  }

  public assertOpen(): void {
    if (this.isClosed) {
      throw new CredoError(`ayni-flow: flow '${this.threadId}' is already closed (${this.state})`)
    }
  }

  public assertState(expected: AyniFlowState | AyniFlowState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `ayni-flow: flow '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: AyniFlowRole): void {
    if (this.role !== expected) {
      throw new CredoError(`ayni-flow: flow '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
