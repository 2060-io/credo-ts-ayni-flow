import type { TagsBase } from '@credo-ts/core'

import { BaseRecord, utils } from '@credo-ts/core'

import type { AyniFlowReferenceOptions } from '../models'
import type { AyniFlowState } from '../types'

export type DefaultAyniFlowEarlyEndTags = {
  /** The flow id the `close` or the problem report names. */
  threadId: string
  connectionId: string
}

export interface AyniFlowEarlyEndStorageProps {
  id?: string
  createdAt?: Date

  threadId: string
  connectionId: string
  /** The closed state the flow takes when its `open` is recorded: the close's outcome, or `failed`. */
  state: AyniFlowState
  reason?: string
  references?: AyniFlowReferenceOptions[]
  errorCode?: string
}

/**
 * A `close`, or a problem report, received before the `open` of its flow (profile §5.2, FLOW-CORE-005): the messages
 * of one delivery are processed together, so the end of a flow can be taken before its start. The `open`, when it
 * comes on the same connection, records the flow closed from it and removes it. `createdAt` is when the end arrived.
 */
export class AyniFlowEarlyEndRecord extends BaseRecord<DefaultAyniFlowEarlyEndTags, TagsBase> {
  public static readonly type = 'AyniFlowEarlyEndRecord'
  public readonly type = AyniFlowEarlyEndRecord.type

  public threadId!: string
  public connectionId!: string
  public state!: AyniFlowState
  public reason?: string
  public references?: AyniFlowReferenceOptions[]
  public errorCode?: string

  public constructor(props: AyniFlowEarlyEndStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.threadId = props.threadId
      this.connectionId = props.connectionId
      this.state = props.state
      this.reason = props.reason
      this.references = props.references
      this.errorCode = props.errorCode
      this._tags = {}
    }
  }

  public getTags(): DefaultAyniFlowEarlyEndTags & TagsBase {
    return { ...this._tags, threadId: this.threadId, connectionId: this.connectionId }
  }

  /** The flow id, under the name the profile uses. */
  public get flowId(): string {
    return this.threadId
  }
}
