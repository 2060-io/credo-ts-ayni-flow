import type { AgentContext, StorageService } from '@credo-ts/core'

import { EventEmitter, InjectionSymbols, inject, injectable, Repository } from '@credo-ts/core'

import { PeerStatusRecord } from './PeerStatusRecord'

@injectable()
export class PeerStatusRepository extends Repository<PeerStatusRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<PeerStatusRecord>,
    eventEmitter: EventEmitter
  ) {
    super(PeerStatusRecord, storageService, eventEmitter)
  }

  /** The record of a connection, or null. */
  public findByConnectionId(agentContext: AgentContext, connectionId: string) {
    return this.findSingleByQuery(agentContext, { connectionId })
  }

  /** Writes one side of a connection's record, creating the record when the connection has none. */
  public async upsert(
    agentContext: AgentContext,
    connectionId: string,
    change: (record: PeerStatusRecord) => void
  ): Promise<PeerStatusRecord> {
    const existing = await this.findByConnectionId(agentContext, connectionId)
    const record = existing ?? new PeerStatusRecord({ connectionId })
    change(record)
    if (existing) await this.update(agentContext, record)
    else await this.save(agentContext, record)
    return record
  }
}
