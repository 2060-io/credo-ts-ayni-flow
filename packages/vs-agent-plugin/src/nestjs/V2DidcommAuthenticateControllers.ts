import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import type { VsAgent } from '@verana-labs/vs-agent-sdk'

import type { AyniFlowAgentModules } from '../types.js'
import {
  AnswerEnrolBodyDto,
  AnswerStepBodyDto,
  AuthenticateExchangeDto,
  ChooseCombinationBodyDto,
  EnrolExchangeDto,
  FailExchangeBodyDto,
  SendAuthenticateBodyDto,
  SendEnrolChallengeBodyDto,
  SendEnrolRequestBodyDto,
  SendStepBodyDto,
  SendStepResultBodyDto,
  SentMessageDto,
  toAuthenticateExchangeDto,
  toEnrolExchangeDto,
  UnenrolBodyDto,
} from './dto/index.js'

const PIPE = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
const CLOSED_FLOW = 'The flow of the exchange is closed (FLOW-CORE-005): nothing is sent'

/**
 * `https://didcomm.org/authenticate/1.0`, the authentication (flow profile §6.14, CC-VSA-005, CC-VSA-013). A service
 * sends `request`, `step` and `step-result` inside an `authenticate` flow and hears `choice` and `answer` as
 * `didcomm.authenticate.state-changed` events; the `credential`, `document` and `face-match` steps run present-proof,
 * mrtd and calls under the same flow id. The holder routes serve tests and tooling.
 */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/authenticate', version: '2' })
@UsePipes(PIPE)
export class V2DidcommAuthenticateController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {}

  private get api() {
    return this.agent.modules.authenticate
  }

  @Post()
  @ApiOperation({
    summary: 'Ask the person to authenticate',
    description:
      'Sends authenticate/1.0/request inside an authenticate flow (flowId): the purpose, the methods and the accepted combinations.',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async request(@Body() body: SendAuthenticateBodyDto): Promise<AuthenticateExchangeDto> {
    const record = await this.api.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: body.request,
    })
    return toAuthenticateExchangeDto(record)
  }

  @Post(':threadId/step')
  @ApiOperation({
    summary: 'Announce a step, or send it again',
    description:
      'Sends authenticate/1.0/step: the next method of the combination chosen (identifying methods first, then confirming ones), once every step before it passed; or the current step again (another ask, a wrong code, a refused new code).',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async step(
    @Param('threadId') threadId: string,
    @Body() body: SendStepBodyDto
  ): Promise<AuthenticateExchangeDto> {
    return toAuthenticateExchangeDto(await this.api.sendStep({ threadId, step: body.step }))
  }

  @Post(':threadId/step-result')
  @ApiOperation({
    summary: 'End the current step',
    description:
      'Sends authenticate/1.0/step-result: passed, failed or expired, with a reason when it did not pass. A face-match step whose consent the person declined ends failed with consent-declined; a new choice is then awaited (awaitingChoice).',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async stepResult(
    @Param('threadId') threadId: string,
    @Body() body: SendStepResultBodyDto
  ): Promise<AuthenticateExchangeDto> {
    return toAuthenticateExchangeDto(await this.api.sendStepResult({ threadId, result: body.result }))
  }

  @Post(':threadId/choice')
  @ApiOperation({
    summary: 'Choose a combination (holder side)',
    description:
      'Sends authenticate/1.0/choice: in answer to the request, or again after a step that ended consent-declined, then a combination without the declined method.',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async choose(
    @Param('threadId') threadId: string,
    @Body() body: ChooseCombinationBodyDto
  ): Promise<AuthenticateExchangeDto> {
    return toAuthenticateExchangeDto(await this.api.choose({ threadId, combination: body.combination }))
  }

  @Post(':threadId/answer')
  @ApiOperation({
    summary: 'Answer a step (holder side)',
    description: 'Sends authenticate/1.0/answer; a face-match consent is true, or false when the person declines.',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async answer(
    @Param('threadId') threadId: string,
    @Body() body: AnswerStepBodyDto
  ): Promise<AuthenticateExchangeDto> {
    return toAuthenticateExchangeDto(await this.api.answer({ threadId, answer: body.answer }))
  }

  @Get()
  @ApiOperation({ summary: 'List authentications', description: 'Filter by flow or connection.' })
  @ApiQuery({ name: 'flowId', required: false })
  @ApiQuery({ name: 'connectionId', required: false })
  @ApiOkResponse({ type: [AuthenticateExchangeDto] })
  public async list(
    @Query('flowId') flowId?: string,
    @Query('connectionId') connectionId?: string
  ): Promise<AuthenticateExchangeDto[]> {
    const records = flowId
      ? await this.api.findByFlowId(flowId)
      : await this.api.findAllByQuery(connectionId ? { connectionId } : {})
    return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(toAuthenticateExchangeDto)
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get an authentication by its request id' })
  @ApiOkResponse({ type: AuthenticateExchangeDto })
  @ApiNotFoundResponse({ description: 'No authentication with the given request id' })
  public async get(@Param('threadId') threadId: string): Promise<AuthenticateExchangeDto> {
    const record = await this.api.findByThreadId(threadId)
    if (!record) throw new NotFoundException(`No authentication ${threadId}`)
    return toAuthenticateExchangeDto(record)
  }

  @Post(':threadId/fail')
  @ApiOperation({
    summary: 'Record a failure decided by the controller',
    description: 'Recorded locally; nothing is sent (send the flow problem report through ayni-flow).',
  })
  @ApiCreatedResponse({ type: AuthenticateExchangeDto })
  public async fail(
    @Param('threadId') threadId: string,
    @Body() body: FailExchangeBodyDto
  ): Promise<AuthenticateExchangeDto> {
    return toAuthenticateExchangeDto(await this.api.fail(threadId, body.code, body.description))
  }
}

/**
 * `https://didcomm.org/authenticate/1.0`, the enrolment of an authenticator app or a passkey (flow profile §6.4,
 * CC-VSA-005). A holder opens an `enrol` flow and sends `enrol-request`; the service answers with `enrol-challenge`,
 * hears `enrol-answer` as `didcomm.authenticate.enrol-state-changed`, and `unenrol` as
 * `didcomm.authenticate.unenrol-received`. The holder routes serve tests and tooling.
 */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/authenticate-enrol', version: '2' })
@UsePipes(PIPE)
export class V2DidcommAuthenticateEnrolController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {}

  private get api() {
    return this.agent.modules.authenticate
  }

  @Post()
  @ApiOperation({
    summary: 'Ask to enrol (holder side)',
    description: 'Sends authenticate/1.0/enrol-request inside the enrol flow (flowId).',
  })
  @ApiCreatedResponse({ type: EnrolExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async enrol(@Body() body: SendEnrolRequestBodyDto): Promise<EnrolExchangeDto> {
    const record = await this.api.enrol({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      type: body.type,
    })
    return toEnrolExchangeDto(record)
  }

  @Post('unenrol')
  @ApiOperation({
    summary: 'Remove an enrolled method (holder side)',
    description: 'Sends authenticate/1.0/unenrol, outside any flow; the service answers with a peer status.',
  })
  @ApiCreatedResponse({ type: SentMessageDto })
  public async unenrol(@Body() body: UnenrolBodyDto): Promise<SentMessageDto> {
    const { messageId } = await this.api.unenrol({ connectionId: body.connectionId, type: body.type })
    return { id: messageId }
  }

  @Post(':threadId/challenge')
  @ApiOperation({
    summary: 'Send the enrolment challenge',
    description:
      "Sends authenticate/1.0/enrol-challenge: a passkey's creation options, or an authenticator app's secret, otpauth link, 6 digits and 30 seconds. After a wrong code, again with the same secret, error wrong-code and triesLeft, the codes left (2, then 1); the first challenge carries neither, and a fourth is refused. The secret is not kept on the record.",
  })
  @ApiCreatedResponse({ type: EnrolExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async challenge(
    @Param('threadId') threadId: string,
    @Body() body: SendEnrolChallengeBodyDto
  ): Promise<EnrolExchangeDto> {
    return toEnrolExchangeDto(await this.api.sendEnrolChallenge({ threadId, challenge: body.challenge }))
  }

  @Post(':threadId/answer')
  @ApiOperation({ summary: 'Answer the challenge (holder side)', description: 'Sends authenticate/1.0/enrol-answer.' })
  @ApiCreatedResponse({ type: EnrolExchangeDto })
  @ApiConflictResponse({ description: CLOSED_FLOW })
  public async answer(
    @Param('threadId') threadId: string,
    @Body() body: AnswerEnrolBodyDto
  ): Promise<EnrolExchangeDto> {
    return toEnrolExchangeDto(await this.api.answerEnrol({ threadId, answer: body.answer }))
  }

  @Get()
  @ApiOperation({ summary: 'List enrolments', description: 'Filter by flow or connection.' })
  @ApiQuery({ name: 'flowId', required: false })
  @ApiQuery({ name: 'connectionId', required: false })
  @ApiOkResponse({ type: [EnrolExchangeDto] })
  public async list(
    @Query('flowId') flowId?: string,
    @Query('connectionId') connectionId?: string
  ): Promise<EnrolExchangeDto[]> {
    const records = flowId
      ? await this.api.findEnrolmentsByFlowId(flowId)
      : await this.api.findAllEnrolmentsByQuery(connectionId ? { connectionId } : {})
    return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(toEnrolExchangeDto)
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get an enrolment by its enrol-request id' })
  @ApiOkResponse({ type: EnrolExchangeDto })
  @ApiNotFoundResponse({ description: 'No enrolment with the given id' })
  public async get(@Param('threadId') threadId: string): Promise<EnrolExchangeDto> {
    const record = await this.api.findEnrolByThreadId(threadId)
    if (!record) throw new NotFoundException(`No enrolment ${threadId}`)
    return toEnrolExchangeDto(record)
  }

  @Post(':threadId/fail')
  @ApiOperation({
    summary: 'Record a failure decided by the controller',
    description: 'Recorded locally; nothing is sent.',
  })
  @ApiCreatedResponse({ type: EnrolExchangeDto })
  public async fail(@Param('threadId') threadId: string, @Body() body: FailExchangeBodyDto): Promise<EnrolExchangeDto> {
    return toEnrolExchangeDto(await this.api.failEnrol(threadId, body.code, body.description))
  }
}
