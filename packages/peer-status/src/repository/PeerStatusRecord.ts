import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, utils } from '@credo-ts/core'

import type { PeerStatus } from '../fields'

export type DefaultPeerStatusTags = {
  connectionId: string
}

export type CustomPeerStatusTags = TagsBase

export type PeerStatusTags = RecordTags<PeerStatusRecord>

export interface PeerStatusStorageProps {
  id?: string
  createdAt?: Date
  connectionId: string
  sent?: PeerStatus
  /** ISO 8601 */
  sentAt?: string
  received?: PeerStatus
  /** ISO 8601 */
  receivedAt?: string
  tags?: CustomPeerStatusTags
}

/**
 * The statuses of one connection: the last one this agent sent, which is the one it answers a query with, and the
 * last one it received, which rules until the next (profile §4.1, FLOW-STAT-005). One record per connection.
 */
export class PeerStatusRecord extends BaseRecord<DefaultPeerStatusTags, CustomPeerStatusTags> {
  public static readonly type = 'PeerStatusRecord'
  public readonly type = PeerStatusRecord.type

  public connectionId!: string

  /** What this agent last told the peer. */
  public sent?: PeerStatus
  /** When, ISO 8601. */
  public sentAt?: string

  /** What the peer last told this agent. */
  public received?: PeerStatus
  /** When, ISO 8601. */
  public receivedAt?: string

  public constructor(props: PeerStatusStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.connectionId = props.connectionId
      this.sent = props.sent
      this.sentAt = props.sentAt
      this.received = props.received
      this.receivedAt = props.receivedAt
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultPeerStatusTags & CustomPeerStatusTags {
    return { ...this._tags, connectionId: this.connectionId }
  }
}
