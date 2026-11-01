import type { AgentContext, StorageService } from '@credo-ts/core'

import { EventEmitter, InjectionSymbols, inject, injectable, Repository } from '@credo-ts/core'

import { AuthorizeRecord } from './AuthorizeRecord'

@injectable()
export class AuthorizeRepository extends Repository<AuthorizeRecord> {
  public constructor(
    @inject(InjectionSymbols.StorageService) storageService: StorageService<AuthorizeRecord>,
    eventEmitter: EventEmitter
  ) {
    super(AuthorizeRecord, storageService, eventEmitter)
  }

  /** The record of a `request` id. */
  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.findSingleByQuery(agentContext, { threadId })
  }

  /** The exchanges that ran inside one ayni-flow. */
  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.findByQuery(agentContext, { parentThreadId })
  }

  public findByConnectionId(agentContext: AgentContext, connectionId: string) {
    return this.findByQuery(agentContext, { connectionId })
  }
}
