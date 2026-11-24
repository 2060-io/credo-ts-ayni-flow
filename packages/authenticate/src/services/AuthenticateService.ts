import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import {
  type AuthenticateAnswer,
  type AuthenticateChoice,
  type AuthenticateRequest,
  type AuthenticateStep,
  type AuthenticateStepResult,
  CONSENT_DECLINED,
  ENROL_AUTHENTICATOR_APP_ATTEMPTS,
  type EnrolAnswer,
  type EnrolChallenge,
  type EnrollableMethodType,
} from '../fields'
import {
  AuthenticateAnswerMessage,
  AuthenticateChoiceMessage,
  AuthenticateRequestMessage,
  AuthenticateStepMessage,
  AuthenticateStepResultMessage,
  EnrolAnswerMessage,
  EnrolChallengeMessage,
  EnrolRequestMessage,
} from '../messages'
import { AuthenticateRecord, AuthenticateRepository, EnrolRecord, EnrolRepository } from '../repository'
import {
  AuthenticateEventTypes,
  AuthenticateRole,
  AuthenticateState,
  type AuthenticateStateChangedEvent,
  EnrolState,
  type EnrolStateChangedEvent,
} from '../types'
import {
  findChosenCombination,
  runOrder,
  validateAnswer,
  validateEnrolAnswer,
  validateEnrolChallenge,
  validateEnrolRequest,
  validateRequest,
  validateStep,
  validateStepResult,
} from '../validation'

export interface CreateAuthenticateRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id (`~thread.pthid`). */
  parentThreadId?: string
  request: AuthenticateRequest
}

export interface CreateEnrolRequestOptions {
  connection: DidCommConnectionRecord
  /** The id of the `enrol` flow the holder opened (`~thread.pthid`). */
  parentThreadId?: string
  type: EnrollableMethodType
}

/** What a step carries that the person answers: its `ask`. A step without one is answered by its carrier. */
const awaitsAnswer = (step: AuthenticateStep) => step.ask !== undefined

/** Whether two lists name the same methods, in any order. */
const sameMethods = (a: string[], b: string[]) => a.length === b.length && a.every((name) => b.includes(name))

/** The methods of a combination whose consent the person declined in an earlier step of the exchange. */
const declinedIn = (record: AuthenticateRecord, combination: string[]) =>
  record.declinedMethods.filter((name) => combination.includes(name))

/** The challenge as the record keeps it: an authenticator app's secret and link are not kept (agent D129). */
const keptChallenge = (challenge: EnrolChallenge): EnrolChallenge => {
  const { secret: _secret, otpauthUri: _otpauthUri, ...kept } = challenge
  return kept
}

/**
 * State machines of authenticate/1.0 (profile §6.14 and §6.4): an authentication (`request`, `choice`, `step`,
 * `answer`, `step-result`) and an enrolment (`enrol-request`, `enrol-challenge`, `enrol-answer`). Builds the wire
 * messages and never sends them (sending is `AuthenticateApi`). Every read-then-write of an exchange runs under that
 * exchange's lock: Credo processes the messages of one delivery concurrently.
 */
@injectable()
export class AuthenticateService {
  private readonly locks = new Map<string, Promise<void>>()

  public constructor(
    private readonly repository: AuthenticateRepository,
    private readonly enrolRepository: EnrolRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  // ---- authentication: the service (requester) ---------------------------------------------------

  /** Builds a `request` after checking it against the profile, and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateAuthenticateRequestOptions
  ): Promise<{ message: AuthenticateRequestMessage; record: AuthenticateRecord }> {
    const invalid = validateRequest(options.request, { strictTypes: true })
    if (invalid) throw new CredoError(`authenticate: invalid request: ${invalid}`)

    const message = new AuthenticateRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new AuthenticateRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: AuthenticateRole.Requester,
      state: AuthenticateState.RequestSent,
      request: message.toRequest(),
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /**
   * Receives the `choice`: it must be one of the request's combinations, or the exchange fails `malformed` and the
   * service refuses it with that code (FLOW-SIGNIN-008). A choice comes in answer to the request, and again after a
   * step that ended `consent-declined`, then naming a combination that holds no declined method (§6.14); the attempt
   * before is kept in `earlierAttempts`. Any other choice fails `malformed`, but one that repeats the combination being
   * run, a message delivered twice, is ignored.
   */
  public async processChoice(
    messageContext: DidCommInboundMessageContext<AuthenticateChoiceMessage>
  ): Promise<AuthenticateRecord | null> {
    const { message, agentContext } = messageContext
    return this.withAnswered(messageContext, message.threadId, 'choice', async (record) => {
      if (record.role !== AuthenticateRole.Requester) {
        this.logger.debug(`authenticate: ignoring choice of '${record.threadId}', which this agent did not request`)
        return null
      }
      const named = `[${message.combination.join(', ')}]`
      if (!record.awaitingChoice) {
        if (record.combination && sameMethods(message.combination, record.combination)) {
          this.logger.debug(`authenticate: ignoring choice of '${record.threadId}' repeating the combination being run`)
          return null
        }
        return this.failRecord(
          agentContext,
          record,
          'malformed',
          `the choice ${named} comes while no choice is awaited: a choice answers the request, or a step that ended ${CONSENT_DECLINED}`
        )
      }
      const combination = findChosenCombination(record.request, message.toChoice())
      if (!combination) {
        return this.failRecord(
          agentContext,
          record,
          'malformed',
          `the choice ${named} is not one of the request's combinations`
        )
      }
      const declined = declinedIn(record, combination)
      if (declined.length) {
        return this.failRecord(
          agentContext,
          record,
          'malformed',
          `the choice ${named} holds ${declined.join(', ')}, whose consent the person declined`
        )
      }
      record.chooseCombination(combination)
      await this.updateState(agentContext, record, AuthenticateState.ChoiceReceived)
      return record
    })
  }

  /**
   * Builds a `step` of the combination chosen: the next method in the order of §6.14 (the identifying ones first, as
   * the combination lists them, then the confirming ones) once every step before it passed, or the current step sent
   * again (another `ask`, a wrong code, a refused new code) while it has no result.
   */
  public async createStep(
    agentContext: AgentContext,
    threadId: string,
    step: AuthenticateStep
  ): Promise<{ message: AuthenticateStepMessage; record: AuthenticateRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Requester)
      record.assertState([
        AuthenticateState.ChoiceReceived,
        AuthenticateState.StepSent,
        AuthenticateState.AnswerReceived,
        AuthenticateState.StepResultSent,
      ])
      if (record.awaitingChoice)
        throw new CredoError(`authenticate: the person declined a consent; no step is sent until a new choice comes`)
      const combination = record.combination as string[]
      const invalid = validateStep(record.request, combination, step)
      if (invalid) throw new CredoError(`authenticate: invalid step: ${invalid}`)

      const existing = record.findStep(step.step)
      if (existing) {
        if (existing !== record.currentStep || existing.result)
          throw new CredoError(`authenticate: step '${step.step}' has ended; only the current step is sent again`)
        if (existing.method !== step.method)
          throw new CredoError(`authenticate: step '${step.step}' runs ${existing.method}`)
        if (existing.answer?.consent === false)
          throw new CredoError(
            `authenticate: the person declined the consent of step '${step.step}'; end it failed with ${CONSENT_DECLINED}`
          )
        existing.prompt = { ...step }
        existing.awaitingAnswer = awaitsAnswer(step)
      } else {
        const unfinished = record.steps.find((entry) => entry.result?.outcome !== 'passed')
        if (unfinished)
          throw new CredoError(`authenticate: step '${unfinished.step}' has not passed; no other step follows it`)
        const next = runOrder(record.request, combination)[record.steps.length]
        if (step.method !== next)
          throw new CredoError(
            next
              ? `authenticate: the next step runs ${next} (identifying methods first, then confirming ones)`
              : 'authenticate: every method of the combination has run'
          )
        record.steps.push({
          step: step.step,
          method: step.method,
          type: step.type,
          prompt: { ...step },
          awaitingAnswer: awaitsAnswer(step),
        })
      }
      const message = new AuthenticateStepMessage({
        ...step,
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      await this.updateState(agentContext, record, AuthenticateState.StepSent)
      return { message, record }
    })
  }

  /** Receives an `answer` to the current step, while it waits for one; an answer that breaks a rule fails `malformed`. */
  public async processAnswer(
    messageContext: DidCommInboundMessageContext<AuthenticateAnswerMessage>
  ): Promise<AuthenticateRecord | null> {
    const { message, agentContext } = messageContext
    return this.withAnswered(messageContext, message.threadId, 'answer', async (record) => {
      const entry = record.findStep(message.step)
      if (record.role !== AuthenticateRole.Requester || !entry || !entry.awaitingAnswer || entry.result) {
        this.logger.debug(`authenticate: ignoring answer to step '${message.step}' of '${record.threadId}'`)
        return null
      }
      const answer = message.toAnswer()
      const invalid = validateAnswer(entry.prompt, answer)
      entry.answer = answer
      entry.awaitingAnswer = false
      if (invalid) return this.failRecord(agentContext, record, 'malformed', invalid)
      await this.updateState(agentContext, record, AuthenticateState.AnswerReceived)
      return record
    })
  }

  /** Builds the `step-result` that ends the current step. */
  public async createStepResult(
    agentContext: AgentContext,
    threadId: string,
    result: AuthenticateStepResult
  ): Promise<{ message: AuthenticateStepResultMessage; record: AuthenticateRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Requester)
      record.assertState([AuthenticateState.StepSent, AuthenticateState.AnswerReceived])
      const entry = record.findStep(result.step)
      if (!entry || entry.result) throw new CredoError(`authenticate: step '${result.step}' is not running`)
      const invalid = validateStepResult(result, entry)
      if (invalid) throw new CredoError(`authenticate: invalid step-result: ${invalid}`)

      entry.result = { ...result }
      entry.awaitingAnswer = false
      const message = new AuthenticateStepResultMessage({
        ...result,
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      await this.updateState(agentContext, record, AuthenticateState.StepResultSent)
      return { message, record }
    })
  }

  // ---- authentication: the holder (authenticator) ------------------------------------------------

  /** Receives a `request`; a replay is ignored, a request that breaks a rule is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<AuthenticateRequestMessage>
  ): Promise<AuthenticateRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    return this.withLock(agentContext, message.id, async () => {
      if (await this.repository.findByThreadId(agentContext, message.id)) {
        this.logger.debug(`authenticate: ignoring replayed request '${message.id}'`)
        return null
      }
      const request = message.toRequest()
      const invalid = validateRequest(request)
      const record = new AuthenticateRecord({
        threadId: message.id,
        parentThreadId: message.thread?.parentThreadId,
        connectionId: connection.id,
        role: AuthenticateRole.Authenticator,
        state: invalid ? AuthenticateState.Failed : AuthenticateState.RequestReceived,
        request,
        ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
      })
      if (invalid) this.logger.warn(`authenticate: request '${message.id}' is malformed: ${invalid}`)
      await this.repository.save(agentContext, record)
      this.emitStateChanged(agentContext, record, null)
      return record
    })
  }

  /**
   * Builds the `choice` of a combination the person chose; it must be one of the request's. Sent in answer to the
   * request, and again after a step that ended `consent-declined`, then for a combination that holds no declined
   * method (§6.14).
   */
  public async createChoice(
    agentContext: AgentContext,
    threadId: string,
    choice: AuthenticateChoice
  ): Promise<{ message: AuthenticateChoiceMessage; record: AuthenticateRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Authenticator)
      if (!record.awaitingChoice)
        throw new CredoError(
          `authenticate: exchange '${threadId}' (${record.state}) waits for no choice: a choice answers the request, or a step that ended ${CONSENT_DECLINED}`
        )
      const combination = findChosenCombination(record.request, choice)
      if (!combination) throw new CredoError("authenticate: the choice is not one of the request's combinations")
      const declined = declinedIn(record, combination)
      if (declined.length)
        throw new CredoError(`authenticate: the choice holds ${declined.join(', ')}, whose consent the person declined`)

      record.chooseCombination(combination)
      const message = new AuthenticateChoiceMessage({
        combination: [...choice.combination],
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      await this.updateState(agentContext, record, AuthenticateState.ChoiceSent)
      return { message, record }
    })
  }

  /** Receives a `step` of the combination chosen, new or sent again; a step that breaks a rule fails `malformed`. */
  public async processStep(
    messageContext: DidCommInboundMessageContext<AuthenticateStepMessage>
  ): Promise<AuthenticateRecord | null> {
    const { message, agentContext } = messageContext
    return this.withAnswered(messageContext, message.threadId, 'step', async (record) => {
      // no step before a choice, nor after a declined consent until the new choice
      if (record.role !== AuthenticateRole.Authenticator || record.awaitingChoice) {
        this.logger.debug(`authenticate: ignoring step of '${record.threadId}' in state ${record.state}`)
        return null
      }
      if (!record.combination) return null
      const step = message.toStep()
      const invalid = validateStep(record.request, record.combination, step)
      if (invalid) return this.failRecord(agentContext, record, 'malformed', invalid)
      const existing = record.findStep(step.step)
      if (existing?.result) {
        this.logger.debug(`authenticate: ignoring step '${step.step}' of '${record.threadId}', which has ended`)
        return null
      }
      if (existing) {
        existing.prompt = step
        existing.awaitingAnswer = awaitsAnswer(step)
      } else {
        record.steps.push({
          step: step.step,
          method: step.method,
          type: step.type,
          prompt: step,
          awaitingAnswer: awaitsAnswer(step),
        })
      }
      await this.updateState(agentContext, record, AuthenticateState.StepReceived)
      return record
    })
  }

  /** Builds the `answer` to a step that waits for one, after checking it against the step's `ask`. */
  public async createAnswer(
    agentContext: AgentContext,
    threadId: string,
    answer: AuthenticateAnswer
  ): Promise<{ message: AuthenticateAnswerMessage; record: AuthenticateRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Authenticator)
      if (record.state === AuthenticateState.Failed) throw new CredoError(`authenticate: exchange '${threadId}' failed`)
      const entry = record.findStep(answer.step)
      if (!entry?.awaitingAnswer || entry.result)
        throw new CredoError(`authenticate: step '${answer.step}' waits for no answer`)
      const invalid = validateAnswer(entry.prompt, answer)
      if (invalid) throw new CredoError(`authenticate: invalid answer: ${invalid}`)

      entry.answer = { ...answer }
      entry.awaitingAnswer = false
      const message = new AuthenticateAnswerMessage({
        ...answer,
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      await this.updateState(agentContext, record, AuthenticateState.AnswerSent)
      return { message, record }
    })
  }

  /** Receives the `step-result` of a step announced. */
  public async processStepResult(
    messageContext: DidCommInboundMessageContext<AuthenticateStepResultMessage>
  ): Promise<AuthenticateRecord | null> {
    const { message, agentContext } = messageContext
    return this.withAnswered(messageContext, message.threadId, 'step-result', async (record) => {
      const entry = record.findStep(message.step)
      if (record.role !== AuthenticateRole.Authenticator || !entry || entry.result) {
        this.logger.debug(`authenticate: ignoring step-result of '${message.step}' of '${record.threadId}'`)
        return null
      }
      const result = message.toStepResult()
      const invalid = validateStepResult(result, entry)
      if (invalid) return this.failRecord(agentContext, record, 'malformed', invalid)
      entry.result = result
      entry.awaitingAnswer = false
      await this.updateState(agentContext, record, AuthenticateState.StepResultReceived)
      return record
    })
  }

  // ---- enrolment (§6.4) --------------------------------------------------------------------------

  /** Builds an `enrol-request` (holder) and records it sent. */
  public async createEnrolRequest(
    agentContext: AgentContext,
    options: CreateEnrolRequestOptions
  ): Promise<{ message: EnrolRequestMessage; record: EnrolRecord }> {
    const invalid = validateEnrolRequest({ type: options.type })
    if (invalid) throw new CredoError(`authenticate: invalid enrol-request: ${invalid}`)

    const message = new EnrolRequestMessage({ type: options.type, parentThreadId: options.parentThreadId })
    const record = new EnrolRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: AuthenticateRole.Authenticator,
      state: EnrolState.RequestSent,
      enrolType: options.type,
    })
    await this.enrolRepository.save(agentContext, record)
    this.emitEnrolStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives an `enrol-request` (service); a replay is ignored, an unknown type is recorded `failed` (`malformed`). */
  public async processEnrolRequest(
    messageContext: DidCommInboundMessageContext<EnrolRequestMessage>
  ): Promise<EnrolRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    return this.withLock(agentContext, message.id, async () => {
      if (await this.enrolRepository.findByThreadId(agentContext, message.id)) {
        this.logger.debug(`authenticate: ignoring replayed enrol-request '${message.id}'`)
        return null
      }
      const request = message.toEnrolRequest()
      const invalid = validateEnrolRequest(request)
      const record = new EnrolRecord({
        threadId: message.id,
        parentThreadId: message.thread?.parentThreadId,
        connectionId: connection.id,
        role: AuthenticateRole.Requester,
        state: invalid ? EnrolState.Failed : EnrolState.RequestReceived,
        enrolType: request.type,
        ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
      })
      if (invalid) this.logger.warn(`authenticate: enrol-request '${message.id}' is malformed: ${invalid}`)
      await this.enrolRepository.save(agentContext, record)
      this.emitEnrolStateChanged(agentContext, record, null)
      return record
    })
  }

  /** Builds an `enrol-challenge` (service): the first, or a new one after a wrong code. */
  public async createEnrolChallenge(
    agentContext: AgentContext,
    threadId: string,
    challenge: EnrolChallenge
  ): Promise<{ message: EnrolChallengeMessage; record: EnrolRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getEnrolByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Requester)
      record.assertState([EnrolState.RequestReceived, EnrolState.AnswerReceived])
      if (record.enrolType === 'authenticator-app' && record.challenges >= ENROL_AUTHENTICATOR_APP_ATTEMPTS)
        throw new CredoError(
          `authenticate: an authenticator app's enrolment takes ${ENROL_AUTHENTICATOR_APP_ATTEMPTS} codes in all; after the last wrong code it ends failed`
        )
      const invalid = validateEnrolChallenge({ type: record.enrolType }, challenge, record.challenges)
      if (invalid) throw new CredoError(`authenticate: invalid enrol-challenge: ${invalid}`)

      const message = new EnrolChallengeMessage({
        ...challenge,
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      record.challenge = keptChallenge(challenge)
      record.challenges += 1
      await this.updateEnrolState(agentContext, record, EnrolState.ChallengeSent, challenge)
      return { message, record }
    })
  }

  /** Receives an `enrol-challenge` (holder); one that breaks a rule fails `malformed`. */
  public async processEnrolChallenge(
    messageContext: DidCommInboundMessageContext<EnrolChallengeMessage>
  ): Promise<EnrolRecord | null> {
    const { message, agentContext } = messageContext
    return this.withEnrolAnswered(messageContext, message.threadId, 'enrol-challenge', async (record) => {
      if (
        record.role !== AuthenticateRole.Authenticator ||
        (record.state !== EnrolState.RequestSent && record.state !== EnrolState.AnswerSent)
      ) {
        this.logger.debug(`authenticate: ignoring enrol-challenge of '${record.threadId}' in state ${record.state}`)
        return null
      }
      const challenge = message.toChallenge()
      const invalid = validateEnrolChallenge({ type: record.enrolType }, challenge, record.challenges)
      if (invalid) return this.failEnrolRecord(agentContext, record, 'malformed', invalid)
      record.challenge = keptChallenge(challenge)
      record.challenges += 1
      await this.updateEnrolState(agentContext, record, EnrolState.ChallengeReceived, challenge)
      return record
    })
  }

  /** Builds the `enrol-answer` (holder): the passkey's attestation, or the authenticator app's code. */
  public async createEnrolAnswer(
    agentContext: AgentContext,
    threadId: string,
    answer: EnrolAnswer
  ): Promise<{ message: EnrolAnswerMessage; record: EnrolRecord }> {
    return this.withLock(agentContext, threadId, async () => {
      const record = await this.getEnrolByThreadId(agentContext, threadId)
      record.assertRole(AuthenticateRole.Authenticator)
      record.assertState(EnrolState.ChallengeReceived)
      const invalid = validateEnrolAnswer({ type: record.enrolType }, answer)
      if (invalid) throw new CredoError(`authenticate: invalid enrol-answer: ${invalid}`)

      const message = new EnrolAnswerMessage({
        ...answer,
        threadId: record.threadId,
        parentThreadId: record.parentThreadId,
      })
      record.answer = { ...answer }
      await this.updateEnrolState(agentContext, record, EnrolState.AnswerSent)
      return { message, record }
    })
  }

  /** Receives the `enrol-answer` (service); one that breaks a rule fails `malformed`. */
  public async processEnrolAnswer(
    messageContext: DidCommInboundMessageContext<EnrolAnswerMessage>
  ): Promise<EnrolRecord | null> {
    const { message, agentContext } = messageContext
    return this.withEnrolAnswered(messageContext, message.threadId, 'enrol-answer', async (record) => {
      if (record.role !== AuthenticateRole.Requester || record.state !== EnrolState.ChallengeSent) {
        this.logger.debug(`authenticate: ignoring enrol-answer of '${record.threadId}' in state ${record.state}`)
        return null
      }
      const answer = message.toEnrolAnswer()
      record.answer = answer
      const invalid = validateEnrolAnswer({ type: record.enrolType }, answer)
      if (invalid) return this.failEnrolRecord(agentContext, record, 'malformed', invalid)
      await this.updateEnrolState(agentContext, record, EnrolState.AnswerReceived)
      return record
    })
  }

  // ---- either side ------------------------------------------------------------------------------

  /** Records a failure decided by the host (the person declined, the flow was refused or closed...). */
  public async fail(
    agentContext: AgentContext,
    threadId: string,
    code: string,
    description?: string
  ): Promise<AuthenticateRecord> {
    return this.withLock(agentContext, threadId, async () =>
      this.failRecord(agentContext, await this.getByThreadId(agentContext, threadId), code, description)
    )
  }

  /** Records a failure of an enrolment decided by the host. */
  public async failEnrol(
    agentContext: AgentContext,
    threadId: string,
    code: string,
    description?: string
  ): Promise<EnrolRecord> {
    return this.withLock(agentContext, threadId, async () =>
      this.failEnrolRecord(agentContext, await this.getEnrolByThreadId(agentContext, threadId), code, description)
    )
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<AuthenticateRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`authenticate: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<AuthenticateRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  public async getEnrolByThreadId(agentContext: AgentContext, threadId: string): Promise<EnrolRecord> {
    const record = await this.enrolRepository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`authenticate: no enrolment '${threadId}'`)
    return record
  }

  public findEnrolByThreadId(agentContext: AgentContext, threadId: string) {
    return this.enrolRepository.findByThreadId(agentContext, threadId)
  }

  public findEnrolByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.enrolRepository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllEnrolByQuery(agentContext: AgentContext, query: Query<EnrolRecord>, queryOptions?: QueryOptions) {
    return this.enrolRepository.findByQuery(agentContext, query, queryOptions)
  }

  // ---- internals --------------------------------------------------------------------------------

  /**
   * Runs `operation` on the record of a message that answers one of ours: under the exchange's lock, from a fresh read,
   * and only when the record exists, belongs to the message's connection and has not failed.
   */
  private async withAnswered(
    messageContext: DidCommInboundMessageContext,
    threadId: string,
    what: string,
    operation: (record: AuthenticateRecord) => Promise<AuthenticateRecord | null>
  ): Promise<AuthenticateRecord | null> {
    const connection = messageContext.assertReadyConnection()
    return this.withLock(messageContext.agentContext, threadId, async () => {
      const record = await this.repository.findByThreadId(messageContext.agentContext, threadId)
      if (!record) {
        this.logger.debug(`authenticate: ignoring ${what} of unknown exchange '${threadId}'`)
        return null
      }
      if (record.connectionId !== connection.id) {
        this.logger.warn(`authenticate: ignoring ${what} of '${threadId}' from another connection`)
        return null
      }
      if (record.state === AuthenticateState.Failed) {
        this.logger.debug(`authenticate: ignoring ${what} of '${threadId}', which failed`)
        return null
      }
      return operation(record)
    })
  }

  private async withEnrolAnswered(
    messageContext: DidCommInboundMessageContext,
    threadId: string,
    what: string,
    operation: (record: EnrolRecord) => Promise<EnrolRecord | null>
  ): Promise<EnrolRecord | null> {
    const connection = messageContext.assertReadyConnection()
    return this.withLock(messageContext.agentContext, threadId, async () => {
      const record = await this.enrolRepository.findByThreadId(messageContext.agentContext, threadId)
      if (!record) {
        this.logger.debug(`authenticate: ignoring ${what} of unknown enrolment '${threadId}'`)
        return null
      }
      if (record.connectionId !== connection.id) {
        this.logger.warn(`authenticate: ignoring ${what} of '${threadId}' from another connection`)
        return null
      }
      if (record.state === EnrolState.Failed) {
        this.logger.debug(`authenticate: ignoring ${what} of '${threadId}', which failed`)
        return null
      }
      return operation(record)
    })
  }

  private async withLock<T>(agentContext: AgentContext, threadId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${agentContext.contextCorrelationId}:${threadId}`
    const previous = this.locks.get(key) ?? Promise.resolve()
    let release = () => {}
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => done)
    this.locks.set(key, tail)
    try {
      await previous
      return await operation()
    } finally {
      release()
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }

  private async failRecord(
    agentContext: AgentContext,
    record: AuthenticateRecord,
    code: string,
    description?: string
  ): Promise<AuthenticateRecord> {
    if (code === 'malformed')
      this.logger.warn(`authenticate: exchange '${record.threadId}' is malformed: ${description}`)
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, AuthenticateState.Failed)
    return record
  }

  private async failEnrolRecord(
    agentContext: AgentContext,
    record: EnrolRecord,
    code: string,
    description?: string
  ): Promise<EnrolRecord> {
    if (code === 'malformed')
      this.logger.warn(`authenticate: enrolment '${record.threadId}' is malformed: ${description}`)
    record.errorCode = code
    record.errorDescription = description
    await this.updateEnrolState(agentContext, record, EnrolState.Failed)
    return record
  }

  private async updateState(agentContext: AgentContext, record: AuthenticateRecord, state: AuthenticateState) {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(
    agentContext: AgentContext,
    record: AuthenticateRecord,
    previousState: AuthenticateState | null
  ) {
    this.eventEmitter.emit<AuthenticateStateChangedEvent>(agentContext, {
      type: AuthenticateEventTypes.AuthenticateStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }

  private async updateEnrolState(
    agentContext: AgentContext,
    record: EnrolRecord,
    state: EnrolState,
    challenge?: EnrolChallenge
  ) {
    const previousState = record.state
    record.state = state
    await this.enrolRepository.update(agentContext, record)
    this.emitEnrolStateChanged(agentContext, record, previousState, challenge)
  }

  private emitEnrolStateChanged(
    agentContext: AgentContext,
    record: EnrolRecord,
    previousState: EnrolState | null,
    challenge?: EnrolChallenge
  ) {
    this.eventEmitter.emit<EnrolStateChangedEvent>(agentContext, {
      type: AuthenticateEventTypes.EnrolStateChanged,
      payload: { record: record.clone(), previousState, ...(challenge ? { challenge: { ...challenge } } : {}) },
    })
  }
}
