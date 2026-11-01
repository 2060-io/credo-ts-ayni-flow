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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import type { VsAgent } from '@verana-labs/vs-agent-sdk'

import type { AyniFlowAgentModules } from '../types'
import {
  CarrierExchangeDto,
  FailExchangeBodyDto,
  GrantSessionBodyDto,
  RespondAuthorizeBodyDto,
  RespondConfirmBodyDto,
  RespondLinkSessionBodyDto,
  RespondSignTxBodyDto,
  SendAuthorizeBodyDto,
  SendConfirmBodyDto,
  SendLinkSessionBodyDto,
  SendNotificationBodyDto,
  SendReissueBodyDto,
  SendRevocationNotificationBodyDto,
  SendSessionGrantRequestBodyDto,
  SendSignTxBodyDto,
  SentMessageDto,
  toCarrierExchangeDto,
} from './dto'

const PIPE = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })

interface CarrierApiLike {
  findByThreadId(threadId: string): Promise<CarrierRecordLike | null>
  findByFlowId(flowId: string): Promise<CarrierRecordLike[]>
  findAllByQuery(query: Record<string, unknown>): Promise<CarrierRecordLike[]>
  fail(threadId: string, code: string, description?: string): Promise<CarrierRecordLike>
}
type CarrierRecordLike = Parameters<typeof toCarrierExchangeDto>[0]

/** The read and fail routes every carrier controller shares. */
abstract class CarrierReadController {
  protected abstract api(): CarrierApiLike

  @Get()
  @ApiOperation({ summary: 'List exchanges', description: 'Exchanges of this protocol; filter by flow or connection.' })
  @ApiQuery({ name: 'flowId', required: false })
  @ApiQuery({ name: 'connectionId', required: false })
  @ApiOkResponse({ type: [CarrierExchangeDto] })
  public async list(
    @Query('flowId') flowId?: string,
    @Query('connectionId') connectionId?: string
  ): Promise<CarrierExchangeDto[]> {
    const records = flowId
      ? await this.api().findByFlowId(flowId)
      : await this.api().findAllByQuery(connectionId ? { connectionId } : {})
    return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(toCarrierExchangeDto)
  }

  @Get(':threadId')
  @ApiOperation({ summary: 'Get an exchange by its request id' })
  @ApiOkResponse({ type: CarrierExchangeDto })
  @ApiNotFoundResponse({ description: 'No exchange with the given request id' })
  public async get(@Param('threadId') threadId: string): Promise<CarrierExchangeDto> {
    const record = await this.api().findByThreadId(threadId)
    if (!record) throw new NotFoundException(`No exchange ${threadId}`)
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/fail')
  @ApiOperation({
    summary: 'Record a failure decided by the controller',
    description:
      'The exchange is recorded failed locally; nothing is sent (send the flow problem report through ayni-flow).',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async fail(
    @Param('threadId') threadId: string,
    @Body() body: FailExchangeBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.api().fail(threadId, body.code, body.description))
  }
}

/** `https://didcomm.org/authorize/1.0` (flow profile §6.5). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/authorize', version: '2' })
@UsePipes(PIPE)
export class V2DidcommAuthorizeController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.authorize
  }

  @Post()
  @ApiOperation({
    summary: 'Ask for an authorization',
    description: 'Sends authorize/1.0/request: a permission the person grants, or a request an approver decides.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendAuthorizeBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.authorize.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: body.request,
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/response')
  @ApiOperation({ summary: 'Answer a received authorization request' })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async respond(
    @Param('threadId') threadId: string,
    @Body() body: RespondAuthorizeBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.authorize.respond({ threadId, response: body.response }))
  }
}

/** `https://didcomm.org/confirm/1.0` (flow profile §6.6). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/confirm', version: '2' })
@UsePipes(PIPE)
export class V2DidcommConfirmController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.confirm
  }

  @Post()
  @ApiOperation({
    summary: 'Ask for a confirmation',
    description: 'Sends confirm/1.0/request: a yes-or-no with a code the service also shows elsewhere.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendConfirmBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.confirm.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: body.request,
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/response')
  @ApiOperation({ summary: 'Answer a received confirmation request' })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async respond(
    @Param('threadId') threadId: string,
    @Body() body: RespondConfirmBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.confirm.respond({ threadId, response: body.response }))
  }
}

/** `https://didcomm.org/link-session/1.0` (flow profile §6.7). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/link-session', version: '2' })
@UsePipes(PIPE)
export class V2DidcommLinkSessionController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.linkSession
  }

  @Post()
  @ApiOperation({
    summary: 'Ask the holder to link a browser session',
    description:
      'Sends link-session/1.0/request with the agent, the browser, the web origin, the start time and the invitation id.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendLinkSessionBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.linkSession.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: { ...body.request, codes: body.request.codes ?? null },
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/response')
  @ApiOperation({ summary: 'Answer a received link-session request' })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async respond(
    @Param('threadId') threadId: string,
    @Body() body: RespondLinkSessionBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.linkSession.respond({ threadId, response: body.response }))
  }
}

/** `https://didcomm.org/session-grant/1.0` (flow profile §6.8). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/session-grant', version: '2' })
@UsePipes(PIPE)
export class V2DidcommSessionGrantController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.sessionGrant
  }

  @Post()
  @ApiOperation({
    summary: 'Ask an agent for a session grant (holder side)',
    description: 'Sends session-grant/1.0/request; a service normally receives these and answers with the grant route.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendSessionGrantRequestBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.sessionGrant.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: { ...body.request, conversationId: body.request.conversationId ?? null },
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/grant')
  @ApiOperation({
    summary: 'Answer a session-grant request with the grant',
    description:
      'Sends session-grant/1.0/grant: an opaque single-use grant valid for at most sixty seconds and the sessions URL (PROF-SESS-013).',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async grant(
    @Param('threadId') threadId: string,
    @Body() body: GrantSessionBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.sessionGrant.respond({ threadId, response: body.grant }))
  }
}

/** `https://didcomm.org/sign-tx/1.0` (flow profile §6.9). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/sign-tx', version: '2' })
@UsePipes(PIPE)
export class V2DidcommSignTxController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.signTx
  }

  @Post()
  @ApiOperation({
    summary: 'Ask the holder to sign a transaction',
    description: 'Sends sign-tx/1.0/request with the Cosmos SDK sign document, the summary and who broadcasts.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendSignTxBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.signTx.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: body.request,
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/response')
  @ApiOperation({ summary: 'Answer a received sign-tx request' })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async respond(
    @Param('threadId') threadId: string,
    @Body() body: RespondSignTxBodyDto
  ): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.signTx.respond({ threadId, response: body.response }))
  }
}

/** `https://didcomm.org/reissue/1.0` (flow profile §6.11). */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/reissue', version: '2' })
@UsePipes(PIPE)
export class V2DidcommReissueController extends CarrierReadController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {
    super()
  }
  protected api() {
    return this.agent.modules.reissue
  }

  @Post()
  @ApiOperation({ summary: 'Ask an issuer to reissue a credential (holder side)' })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async request(@Body() body: SendReissueBodyDto): Promise<CarrierExchangeDto> {
    const record = await this.agent.modules.reissue.request({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      request: body.request,
    })
    return toCarrierExchangeDto(record)
  }

  @Post(':threadId/answered')
  @ApiOperation({
    summary: 'Record that a reissue request was answered',
    description: 'By an issue flow or by a problem report sent through ayni-flow; nothing is sent here.',
  })
  @ApiCreatedResponse({ type: CarrierExchangeDto })
  public async answered(@Param('threadId') threadId: string): Promise<CarrierExchangeDto> {
    return toCarrierExchangeDto(await this.agent.modules.reissue.markAnswered(threadId))
  }
}

/** `https://didcomm.org/notify/1.0` (flow profile §6.10): one message, no record. */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/notify', version: '2' })
@UsePipes(PIPE)
export class V2DidcommNotifyController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {}

  @Post()
  @ApiOperation({
    summary: 'Send a notification',
    description:
      'Sends notify/1.0/notification; the holder posts an OS notification and marks the conversation unread. Never for a flow: the flow is its own notification.',
  })
  @ApiCreatedResponse({ type: SentMessageDto })
  public async send(@Body() body: SendNotificationBodyDto): Promise<SentMessageDto> {
    const { messageId } = await this.agent.modules.notify.send({
      connectionId: body.connectionId,
      parentThreadId: body.flowId,
      notification: body.notification,
    })
    return { id: messageId }
  }
}

/** `revocation_notification/2.0/revoke` (flow profile §6.12, CC-VSA-007), through Credo's credentials module. */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/revocation-notification', version: '2' })
@UsePipes(PIPE)
export class V2DidcommRevocationNotificationController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {}

  @Post()
  @ApiOperation({
    summary: 'Notify the holder that a credential was revoked',
    description:
      'Sends revocation_notification/2.0/revoke with the revocation id and format; the holder marks the card revoked and asks nothing.',
  })
  @ApiCreatedResponse({ description: 'Sent' })
  public async send(@Body() body: SendRevocationNotificationBodyDto): Promise<{ sent: true }> {
    await this.agent.didcomm.credentials.sendRevocationNotification({
      connectionId: body.connectionId,
      revocationId: body.revocationId,
      revocationFormat: body.revocationFormat ?? 'anoncreds',
      comment: body.comment,
    })
    return { sent: true }
  }
}
