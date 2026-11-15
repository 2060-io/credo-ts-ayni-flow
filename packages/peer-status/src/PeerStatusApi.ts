import { AgentContext, CredoError, injectable } from '@credo-ts/core'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import type { PeerStatus } from './fields'
import { PeerStatusQueryMessage, PeerStatusStatusMessage } from './messages'
import { PeerStatusModuleConfig } from './PeerStatusModuleConfig'
import { type PeerStatusRecord, PeerStatusRepository } from './repository'
import { validateStatus } from './validation'

export interface SendPeerStatusOptions {
  connectionId: string
  status: PeerStatus
}

/** `https://didcomm.org/peer-status/1.0` (Ayni Flow Profile 1.0 §4.1). */
@injectable()
export class PeerStatusApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly config: PeerStatusModuleConfig,
    private readonly repository: PeerStatusRepository,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  /**
   * Tells the peer of a connection where it stands (FLOW-STAT-001). The status is kept as the one this agent
   * answers a `query` with; it replaces the one sent before. Returns the message id.
   */
  public async send(options: SendPeerStatusOptions): Promise<{ messageId: string }> {
    if (!this.config.isNotifier) throw new CredoError('peer-status: this agent is not a notifier')
    const invalid = validateStatus(options.status, { strictRefusal: true })
    if (invalid) throw new CredoError(`peer-status: invalid status: ${invalid}`)

    const connectionRecord = await this.connectionService.getById(this.agentContext, options.connectionId)
    connectionRecord.assertReady()

    const message = new PeerStatusStatusMessage(options.status)
    await this.repository.upsert(this.agentContext, connectionRecord.id, (record) => {
      record.sent = message.toStatus()
      record.sentAt = new Date().toISOString()
    })
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, { message, connectionRecord })
    await this.messageSender.sendMessage(outbound)
    return { messageId: message.id }
  }

  /** Asks the peer for its status of this agent (profile §4.1): for a receiver that holds none. Returns the message id. */
  public async query(options: { connectionId: string }): Promise<{ messageId: string }> {
    if (!this.config.isReceiver) throw new CredoError('peer-status: this agent is not a receiver')
    const connectionRecord = await this.connectionService.getById(this.agentContext, options.connectionId)
    connectionRecord.assertReady()

    const message = new PeerStatusQueryMessage()
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, { message, connectionRecord })
    await this.messageSender.sendMessage(outbound)
    return { messageId: message.id }
  }

  /** The statuses of a connection: the last sent and the last received; null when there is none yet. */
  public findByConnectionId(connectionId: string): Promise<PeerStatusRecord | null> {
    return this.repository.findByConnectionId(this.agentContext, connectionId)
  }

  /** Forgets the statuses of a connection, when the connection ends. */
  public async deleteByConnectionId(connectionId: string): Promise<void> {
    const record = await this.repository.findByConnectionId(this.agentContext, connectionId)
    if (record) await this.repository.delete(this.agentContext, record)
  }
}
