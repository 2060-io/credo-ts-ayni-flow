import type { AgentContext, StorageService } from '@credo-ts/core'

import { EventEmitter, InjectionSymbols, inject, injectable, Repository } from '@credo-ts/core'

import { AyniFlowEarlyEndRecord } from './AyniFlowEarlyEndRecord'

@injectable()
export class AyniFlowEarlyEndRepository extends Repository<AyniFlowEarlyEndRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<AyniFlowEarlyEndRecord>,
    eventEmitter: EventEmitter
  ) {
    super(AyniFlowEarlyEndRecord, storageService, eventEmitter)
  }

  /** The end of a flow received on one connection before the flow's `open`. */
  public findByFlow(agentContext: AgentContext, threadId: string, connectionId: string) {
    return this.findSingleByQuery(agentContext, { threadId, connectionId })
  }
}
