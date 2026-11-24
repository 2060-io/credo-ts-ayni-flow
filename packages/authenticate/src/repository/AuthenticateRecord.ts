import type { RecordTags, TagsBase } from '@credo-ts/core'

import { BaseRecord, CredoError, utils } from '@credo-ts/core'

import {
  type AuthenticateAnswer,
  type AuthenticateRequest,
  type AuthenticateStep,
  type AuthenticateStepResult,
  CONSENT_DECLINED,
} from '../fields'
import { AuthenticateRole, AuthenticateState } from '../types'

export type DefaultAuthenticateTags = {
  /** The `@id` of the `request`, the thread id of the exchange. */
  threadId: string
  /** The flow id (`~thread.pthid`). */
  parentThreadId?: string
  connectionId: string
  role: AuthenticateRole
  state: AuthenticateState
}

export type CustomAuthenticateTags = TagsBase

export type AuthenticateTags = RecordTags<AuthenticateRecord>

/** One step of the combination chosen, as it stands: its last `step`, its last `answer`, its `step-result`. */
export interface AuthenticateStepEntry {
  step: string
  method: string
  type: string
  /** The last `step` message of the step (it is sent again after a wrong code). */
  prompt: AuthenticateStep
  /** The last `answer`; absent for a step its carrier answers (credential, document, face-match after consent). */
  answer?: AuthenticateAnswer
  /** Whether the last `step` asks something (`ask`) that no `answer` answered yet. */
  awaitingAnswer: boolean
  result?: AuthenticateStepResult
}

/**
 * An earlier attempt of the exchange: a combination chosen and the steps it ran, the last of which ended
 * `consent-declined` before the person chose another combination (§6.14).
 */
export interface AuthenticateAttempt {
  combination: string[]
  steps: AuthenticateStepEntry[]
}

export interface AuthenticateStorageProps {
  id?: string
  createdAt?: Date
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: AuthenticateRole
  state: AuthenticateState
  request: AuthenticateRequest
  combination?: string[]
  steps?: AuthenticateStepEntry[]
  earlierAttempts?: AuthenticateAttempt[]
  errorCode?: string
  errorDescription?: string
  tags?: CustomAuthenticateTags
}

/** One `https://didcomm.org/authenticate/1.0` authentication (profile §6.14), written on both sides. */
export class AuthenticateRecord extends BaseRecord<DefaultAuthenticateTags, CustomAuthenticateTags> {
  public static readonly type = 'AuthenticateRecord'
  public readonly type = AuthenticateRecord.type

  public threadId!: string
  public parentThreadId?: string
  public connectionId!: string
  public role!: AuthenticateRole
  public state!: AuthenticateState

  /** The `request` as sent or received. */
  public request!: AuthenticateRequest

  /**
   * The combination chosen, as the request lists it (the `choice` may name its methods in another order); after a
   * declined consent and a new `choice`, the new one (the one before is in `earlierAttempts`).
   */
  public combination?: string[]

  /** The steps announced for `combination`, in order. A step id names a step within its attempt. */
  public steps: AuthenticateStepEntry[] = []

  /**
   * The attempts before the current one, oldest first: each a combination and its steps, the last of which ended
   * `consent-declined`. Empty until the person declines a consent and chooses again.
   */
  public earlierAttempts: AuthenticateAttempt[] = []

  /** Set with state `failed`: why (`malformed` when the peer's message broke a rule of the profile). */
  public errorCode?: string
  public errorDescription?: string

  public constructor(props: AuthenticateStorageProps) {
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
      this.combination = props.combination
      this.steps = props.steps ?? []
      this.earlierAttempts = props.earlierAttempts ?? []
      this.errorCode = props.errorCode
      this.errorDescription = props.errorDescription
      this._tags = props.tags ?? {}
    }
  }

  public getTags(): DefaultAuthenticateTags & CustomAuthenticateTags {
    return {
      ...this._tags,
      threadId: this.threadId,
      parentThreadId: this.parentThreadId,
      connectionId: this.connectionId,
      role: this.role,
      state: this.state,
    }
  }

  /** The flow id. */
  public get flowId(): string | undefined {
    return this.parentThreadId
  }

  /** The step of that id, when it was announced. */
  public findStep(step: string): AuthenticateStepEntry | undefined {
    return this.steps.find((entry) => entry.step === step)
  }

  /** The last step announced. */
  public get currentStep(): AuthenticateStepEntry | undefined {
    return this.steps[this.steps.length - 1]
  }

  /**
   * Whether the exchange waits for a `choice`: no combination was chosen yet, or the current step ended
   * `consent-declined` (§6.14). The host runs the five minutes of the choice (`AUTHENTICATE_CHOICE_TIMEOUT_MS`) from
   * the request and again from that step result.
   */
  public get awaitingChoice(): boolean {
    if (this.state === AuthenticateState.Failed) return false
    if (!this.combination) return true
    return this.currentStep?.result?.reason === CONSENT_DECLINED
  }

  /** The methods whose consent the person declined, in every attempt: a new `choice` holds none of them. */
  public get declinedMethods(): string[] {
    const declined = [...this.earlierAttempts.flatMap((attempt) => attempt.steps), ...this.steps]
      .filter((entry) => entry.answer?.consent === false)
      .map((entry) => entry.method)
    return [...new Set(declined)]
  }

  /** Takes the combination of a `choice`: the first, or a new one after a declined consent, the current attempt kept. */
  public chooseCombination(combination: string[]): void {
    if (this.combination) this.earlierAttempts.push({ combination: this.combination, steps: this.steps })
    this.combination = [...combination]
    this.steps = []
  }

  public assertState(expected: AuthenticateState | AuthenticateState[]): void {
    const states = Array.isArray(expected) ? expected : [expected]
    if (!states.includes(this.state)) {
      throw new CredoError(
        `authenticate: exchange '${this.threadId}' is in state ${this.state}, expected ${states.join(' | ')}`
      )
    }
  }

  public assertRole(expected: AuthenticateRole): void {
    if (this.role !== expected) {
      throw new CredoError(`authenticate: exchange '${this.threadId}' has role ${this.role}, expected ${expected}`)
    }
  }
}
