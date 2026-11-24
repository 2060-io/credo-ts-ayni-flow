import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import type { EnrolAnswer, EnrolChallenge, EnrollableMethodType } from '../fields'
import { AuthenticateRole, EnrolState } from '../types'

export type DefaultEnrolTags = {
  /** The `@id` of the `enrol-request`, the thread id of the exchange. */
  threadId: string
  /** The id of the `enrol` flow (`~thread.pthid`). */
  parentThreadId?: string
  connectionId: string
  role: AuthenticateRole
  state: EnrolState
  enrolType: EnrollableMethodType
}

export type CustomEnrolTags = TagsBase

export type EnrolTags = RecordTags<EnrolRecord>

export interface EnrolStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: AuthenticateRole
  state: EnrolState
  enrolType: EnrollableMethodType
  challenge?: EnrolChallenge
  challenges?: number
  answer?: EnrolAnswer
  errorCode?: string
  errorDescription?: string
  tags?: CustomEnrolTags
}

/** One enrolment of an authenticator app or a passkey (profile §6.4), written on both sides. */
export class EnrolRecord extends BaseRecord<DefaultEnrolTags, CustomEnrolTags> {
  public static readonly type = 'AuthenticateEnrolRecord'
  public readonly type = EnrolRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: AuthenticateRole
  public state!: EnrolState
  /** The type enrolled. */
  public enrolType!: EnrollableMethodType

  /**
   * The last challenge, as sent or received. An authenticator app's `secret` and `otpauthUri` are not kept: the event
   * of the challenge carries them once.
   */
  public challenge?: EnrolChallenge
  /** How many challenges were sent or received: the first, then one after each wrong code. */
  public challenges = 0
  /** The last answer, as sent or received. */
  public answer?: EnrolAnswer

  public errorCode?: string
  public errorDescription?: string

  public constructor(props: EnrolStorageProps) {
    super()

    if (props) {
      this.id = props.id ?? utils.uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.threadId = props.threadId
      this.parentThreadId = props.parentThreadId
      this.connectionId = props.connectionId
      this.role = props.role
      this.state = props.state
      this.enrolType = props.enrolType
      this.challenge = props.challenge
      this.challenges = props.challenges ?? 0
      this.answer = props.answer
      this.errorCode = props.errorCode
      this.errorDescription = props.errorDescription
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultEnrolTags & CustomEnrolTags {
    return {
      ...this._tags,
      threadId: this.threadId,
      parentThreadId: this.parentThreadId,
      connectionId: this.connectionId,
      role: this.role,
      state: this.state,
      enrolType: this.enrolType,
    }
  }

  /** The `enrol` flow's id. */
  public get flowId(): string | undefined {
    return this.parentThreadId
  }

  public assertState(expected: EnrolState | EnrolState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `authenticate: enrolment '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: AuthenticateRole): void {
    if (this.role !== expected) {
      throw new CredoError(`authenticate: enrolment '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
