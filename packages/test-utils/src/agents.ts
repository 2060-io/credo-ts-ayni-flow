import { AskarModule } from '@credo-ts/askar'
import type { BaseEvent, ModulesMap } from '@credo-ts/core'
import { Agent, ConsoleLogger, EventEmitter, LogLevel, utils } from '@credo-ts/core'
import { DidCommHandshakeProtocol, DidCommModule } from '@credo-ts/didcomm'
import { agentDependencies } from '@credo-ts/node'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { filter, firstValueFrom, Subject, timeout } from 'rxjs'

import { SubjectInboundTransport, type SubjectMessage, SubjectOutboundTransport } from './SubjectTransports'

/** The Subjects every agent of a test shares; one entry per `rxjs:<name>` endpoint. */
export class SubjectNetwork {
  public readonly subjects: Record<string, Subject<SubjectMessage>> = {}

  public endpoint(name: string): string {
    const endpoint = `rxjs:${name}`
    if (!this.subjects[endpoint]) this.subjects[endpoint] = new Subject<SubjectMessage>()
    return endpoint
  }

  public subject(name: string): Subject<SubjectMessage> {
    return this.subjects[this.endpoint(name)]
  }
}

export interface CreateTestAgentOptions<Modules extends ModulesMap> {
  name: string
  network: SubjectNetwork
  modules: Modules
  logLevel?: LogLevel
}

/**
 * An agent with an in-memory Askar store, DIDComm v1 and the rxjs transports, plus the caller's modules.
 * The agent is NOT initialized; call `agent.initialize()`.
 */
export function createTestAgent<Modules extends ModulesMap>(options: CreateTestAgentOptions<Modules>) {
  const { name, network, modules, logLevel = LogLevel.Off } = options
  const endpoint = network.endpoint(name)

  return new Agent({
    config: {
      logger: new ConsoleLogger(logLevel),
    },
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar,
        store: {
          id: `${name}-${utils.uuid()}`,
          key: 'DZ9hPqFWTPxemcGea72C1X1nusqk5wFNLq6QPjwXGqAa',
          keyDerivationMethod: 'raw',
          database: { type: 'sqlite', config: { inMemory: true } },
        },
      }),
      didcomm: new DidCommModule({
        endpoints: [endpoint],
        didcommVersions: ['v1'],
        connections: { autoAcceptConnections: true },
        transports: {
          inbound: [new SubjectInboundTransport(network.subject(name))],
          outbound: [new SubjectOutboundTransport(network.subjects)],
        },
      }),
      ...modules,
    },
  })
}

/** The type `createTestAgent` returns for a given modules map. */
export type TestAgent<Modules extends ModulesMap> = ReturnType<typeof createTestAgent<Modules>>

type AnyAgent = Agent<any>

/** Connects two initialized agents through an out-of-band invitation and DID Exchange; returns [inviter, invitee] connections. */
export async function makeConnection(inviter: AnyAgent, invitee: AnyAgent) {
  const outOfBand = await inviter.didcomm.oob.createInvitation({
    handshakeProtocols: [DidCommHandshakeProtocol.DidExchange],
  })

  const received = await invitee.didcomm.oob.receiveInvitation(outOfBand.outOfBandInvitation, {
    label: 'test agent',
  })
  if (!received.connectionRecord) throw new Error('receiveInvitation returned no connection record')
  const inviteeConnection = await invitee.didcomm.connections.returnWhenIsConnected(received.connectionRecord.id)

  const [inviterConnectionCandidate] = await inviter.didcomm.connections.findAllByOutOfBandId(outOfBand.id)
  if (!inviterConnectionCandidate) throw new Error('inviter has no connection for the invitation')
  const inviterConnection = await inviter.didcomm.connections.returnWhenIsConnected(inviterConnectionCandidate.id)

  return [inviterConnection, inviteeConnection] as const
}

/** Resolves with the first event of `type` accepted by `predicate`, or rejects after `timeoutMs`. */
export function waitForEvent<T extends BaseEvent>(
  agent: AnyAgent,
  type: T['type'],
  predicate: (event: T) => boolean = () => true,
  timeoutMs = 10000
): Promise<T> {
  const eventEmitter = agent.dependencyManager.resolve(EventEmitter)
  return firstValueFrom(
    eventEmitter.observable<T>(type).pipe(
      filter((event) => predicate(event)),
      timeout(timeoutMs)
    )
  )
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
