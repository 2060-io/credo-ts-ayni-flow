import type { AyniFlowRecord } from '@ayni.org/credo-ts-didcomm-ayni-flow'
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
import { CloseFlowBodyDto, FlowDto, FlowProblemReportBodyDto, OpenFlowBodyDto, toFlowDto } from './dto'

/** `https://didcomm.org/ayni-flow/1.0` (flow profile §5): the envelope that groups carrier messages into one flow. */
@ApiTags('v2/didcomm')
@Controller({ path: 'didcomm/ayni-flow', version: '2' })
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class V2DidcommAyniFlowController {
  public constructor(@Inject('VSAGENT') private readonly agent: VsAgent<AyniFlowAgentModules>) {}

  @Post('flows')
  @ApiOperation({
    summary: 'Open a flow',
    description:
      'Sends ayni-flow/1.0/open on the connection. The returned flowId is the parent thread id to pass as flowId to the carrier calls (authorize, confirm, sign-tx, present-proof...).',
  })
  @ApiCreatedResponse({ description: 'The flow, pending', type: FlowDto })
  @ApiNotFoundResponse({ description: 'No connection with the given id' })
  public async open(@Body() body: OpenFlowBodyDto): Promise<FlowDto> {
    const record = await this.agent.modules.ayniFlow.openFlow({
      connectionId: body.connectionId,
      kind: body.kind,
      title: body.title,
      description: body.description,
      origin: body.origin,
      expiresTime: new Date(body.expiresTime),
      requires: body.requires,
      steps: body.steps,
    })
    return toFlowDto(record)
  }

  @Get('flows')
  @ApiOperation({
    summary: 'List flows',
    description: 'Flows this agent holds, newest first; filter by connection and state.',
  })
  @ApiQuery({ name: 'connectionId', required: false })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'pending | active | completed | declined | cancelled | failed | expired',
  })
  @ApiOkResponse({ type: [FlowDto] })
  public async list(@Query('connectionId') connectionId?: string, @Query('state') state?: string): Promise<FlowDto[]> {
    const records = await this.agent.modules.ayniFlow.findAllByQuery({
      ...(connectionId ? { connectionId } : {}),
      ...(state ? { flowState: state as AyniFlowRecord['state'] } : {}),
    })
    return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(toFlowDto)
  }

  @Get('flows/:flowId')
  @ApiOperation({ summary: 'Get a flow' })
  @ApiOkResponse({ type: FlowDto })
  @ApiNotFoundResponse({ description: 'No flow with the given id' })
  public async get(@Param('flowId') flowId: string): Promise<FlowDto> {
    const record = await this.agent.modules.ayniFlow.findByFlowId(flowId)
    if (!record) throw new NotFoundException(`No flow ${flowId}`)
    return toFlowDto(record)
  }

  @Post('flows/:flowId/close')
  @ApiOperation({
    summary: 'Close a flow',
    description:
      'Sends ayni-flow/1.0/close with the outcome; the opener closes completed or failed when the carrier protocol ends, either party cancelled.',
  })
  @ApiCreatedResponse({ description: 'The flow, closed', type: FlowDto })
  @ApiNotFoundResponse({ description: 'No flow with the given id' })
  public async close(@Param('flowId') flowId: string, @Body() body: CloseFlowBodyDto): Promise<FlowDto> {
    const record = await this.agent.modules.ayniFlow.closeFlow({ flowId, ...body })
    return toFlowDto(record)
  }

  @Post('flows/:flowId/problem-report')
  @ApiOperation({
    summary: 'Refuse or fail a flow',
    description:
      'Sends a report-problem 1.0 with ~thread.pthid = flow id and a code of the flow profile §11; the flow closes failed on both ends.',
  })
  @ApiCreatedResponse({ description: 'The flow, failed', type: FlowDto })
  @ApiNotFoundResponse({ description: 'No flow with the given id' })
  public async problemReport(
    @Param('flowId') flowId: string,
    @Body() body: FlowProblemReportBodyDto
  ): Promise<FlowDto> {
    const record = await this.agent.modules.ayniFlow.sendProblemReport({ flowId, ...body })
    return toFlowDto(record)
  }
}
