import type { AgentContext, StorageService } from '@credo-ts/core'

import { EventEmitter, InjectionSymbols, inject, injectable, Repository } from '@credo-ts/core'

import { AyniFlowState } from '../types'
import { AyniFlowRecord } from './AyniFlowRecord'

@injectable()
export class AyniFlowRepository extends Repository<AyniFlowRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<AyniFlowRecord>,
    eventEmitter: EventEmitter
  ) {
    super(AyniFlowRecord, storageService, eventEmitter)
  }

  /** The record of a flow id (the `open` `@id`). */
  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.findSingleByQuery(agentContext, { threadId })
  }

  public findByConnectionId(agentContext: AgentContext, connectionId: string) {
    return this.findByQuery(agentContext, { connectionId })
  }

  /** Flows that are `pending` or `active`, on one connection or on all of them. */
  public findOpen(agentContext: AgentContext, connectionId?: string) {
    return this.findByQuery(agentContext, {
      ...(connectionId ? { connectionId } : {}),
      $or: [{ flowState: AyniFlowState.Pending }, { flowState: AyniFlowState.Active }],
    })
  }

  public findPendingByConnectionId(agentContext: AgentContext, connectionId: string) {
    return this.findByQuery(agentContext, { connectionId, flowState: AyniFlowState.Pending })
  }
}
