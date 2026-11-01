#!/usr/bin/env python3
"""Generates the boilerplate of a request/response protocol package of credo-ts-ayni-flow.

Usage: python3 scripts/generate-protocol-package.py [package...]   (all six when no name is given)
It OVERWRITES the generated files (module, config, API, record, repository, service, handlers, protocol constants,
index, package.json, tsconfig, tsdown config); edit the template here, never the generated files.

Hand-written per package (not touched here): src/fields.ts, src/messages/<X>RequestMessage.ts,
src/messages/<X>ResponseMessage.ts (when the protocol has a response), src/validation.ts, tests/.
"""
import json, os, sys, textwrap

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'packages')

PACKAGES = {
  'authorize': dict(X='Authorize', camel='authorize', uri='https://didcomm.org/authorize/1.0',
    roles=[('Requester','requester'),('Approver','approver')], requester='Requester', responder='Approver',
    responseType='response', responseClass='AuthorizeResponseMessage',
    description='Credo-TS module for the authorize/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.5): a service asks the person for a permission, or an approver decides someone else\'s request',
    spec='§6.5', hasResponse=True),
  'confirm': dict(X='Confirm', camel='confirm', uri='https://didcomm.org/confirm/1.0',
    roles=[('Requester','requester'),('Confirmer','confirmer')], requester='Requester', responder='Confirmer',
    responseType='response', responseClass='ConfirmResponseMessage',
    description='Credo-TS module for the confirm/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.6): a yes-or-no with a code the service also shows elsewhere',
    spec='§6.6', hasResponse=True),
  'link-session': dict(X='LinkSession', camel='linkSession', uri='https://didcomm.org/link-session/1.0',
    roles=[('Agent','agent'),('Holder','holder')], requester='Agent', responder='Holder',
    responseType='response', responseClass='LinkSessionResponseMessage',
    description='Credo-TS module for the link-session/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.7): an agent asks the holder to link a browser session',
    spec='§6.7', hasResponse=True),
  'session-grant': dict(X='SessionGrant', camel='sessionGrant', uri='https://didcomm.org/session-grant/1.0',
    roles=[('Requester','requester'),('Agent','agent')], requester='Requester', responder='Agent',
    responseType='grant', responseClass='SessionGrantGrantMessage',
    description='Credo-TS module for the session-grant/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.8): the holder obtains a single-use grant for its own AG-UI session',
    spec='§6.8', hasResponse=True),
  'sign-tx': dict(X='SignTx', camel='signTx', uri='https://didcomm.org/sign-tx/1.0',
    roles=[('Requester','requester'),('Signer','signer')], requester='Requester', responder='Signer',
    responseType='response', responseClass='SignTxResponseMessage',
    description='Credo-TS module for the sign-tx/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.9): a service hands the holder a Cosmos SDK sign document to sign and, optionally, broadcast',
    spec='§6.9', hasResponse=True),
  'reissue': dict(X='Reissue', camel='reissue', uri='https://didcomm.org/reissue/1.0',
    roles=[('Requester','requester'),('Issuer','issuer')], requester='Requester', responder='Issuer',
    responseType=None, responseClass=None,
    description='Credo-TS module for the reissue/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.11): after a restore the holder asks an issuer to reissue a credential; the issuer answers with an issue flow or a problem report',
    spec='§6.11', hasResponse=False),
}

def w(path, content):
  os.makedirs(os.path.dirname(path), exist_ok=True)
  with open(path, 'w') as f:
    f.write(textwrap.dedent(content).lstrip('\n'))

def gen(name):
  P = PACKAGES[name]; X = P['X']; camel = P['camel']; d = f'{ROOT}/{name}'
  U = name.upper().replace('-', '_')
  hasResponse = P['hasResponse']
  RC = P['responseClass']
  roles_enum = '\n'.join(f"  {r[0]} = '{r[1]}'," for r in P['roles'])

  w(f'{d}/package.json', json.dumps({
    "name": f"@2060.io/credo-ts-didcomm-{name}", "type": "module", "version": "0.1.0",
    "main": "./build/index.js", "module": "./build/index.js", "types": "./build/index.d.ts",
    "exports": {".": {"types": "./build/index.d.ts", "default": "./build/index.js"}},
    "files": ["build"], "publishConfig": {"access": "public"}, "license": "Apache-2.0",
    "description": P['description'],
    "homepage": f"https://github.com/2060-io/credo-ts-ayni-flow/tree/main/packages/{name}",
    "repository": {"type": "git", "url": "https://github.com/2060-io/credo-ts-ayni-flow", "directory": f"packages/{name}"},
    "scripts": {"build": "tsdown --config ./tsdown.config.ts", "clean": "rimraf ./build", "compile": "tsc -p tsconfig.build.json", "prepublishOnly": "pnpm run build"},
    "dependencies": {"class-transformer": "catalog:", "class-validator": "catalog:"},
    "peerDependencies": {"@credo-ts/core": ">=0.8.0-pr-2704-20261026000000 <0.9.0", "@credo-ts/didcomm": ">=0.8.0-pr-2704-20261026000000 <0.9.0"},
    "devDependencies": {"@credo-ts/core": "catalog:", "@credo-ts/didcomm": "catalog:"}
  }, indent=2) + '\n')
  w(f'{d}/tsconfig.build.json', '''
    {
      "extends": "../../tsconfig.build.json",
      "compilerOptions": {
        "outDir": "./build"
      },
      "include": ["src/**/*"]
    }
  ''')
  w(f'{d}/tsdown.config.ts', '''
    import { defineConfig } from 'tsdown'

    export default defineConfig({
      entry: ['./src/index.ts'],
      format: ['esm'],
      outDir: 'build',
      dts: true,
      sourcemap: true,
      clean: true,
      target: 'es2020',
      platform: 'neutral',
      tsconfig: './tsconfig.build.json',
    })
  ''')

  resp_const = f"export const {U}_RESPONSE_TYPE = `${{{U}_PROTOCOL_URI}}/{P['responseType']}`\n" if hasResponse else ''
  w(f'{d}/src/messages/{X}Protocol.ts', f'''
    /** PIURI of the protocol, Ayni Flow Profile 1.0 {P['spec']}. */
    export const {U}_PROTOCOL_URI = '{P['uri']}'
    export const {U}_REQUEST_TYPE = `${{{U}_PROTOCOL_URI}}/request`
    {resp_const}''')
  w(f'{d}/src/messages/index.ts', f'''
    export * from './{X}Protocol'
    export * from './{X}RequestMessage'
    ''' + (f"export * from './{RC}'\n" if hasResponse else ''))

  states = '''
      RequestSent = 'request-sent',
      RequestReceived = 'request-received',
      ResponseSent = 'response-sent',
      ResponseReceived = 'response-received',
      Failed = 'failed','''
  if not hasResponse:
    states = '''
      RequestSent = 'request-sent',
      RequestReceived = 'request-received',
      /** The issuer opened the `issue` flow, or sent the problem report, that answers the request. */
      Answered = 'answered',
      Failed = 'failed','''
  w(f'{d}/src/types.ts', f'''
    import type {{ BaseEvent }} from '@credo-ts/core'
    import type {{ {X}Record }} from './repository/{X}Record'

    export * from './fields'

    /** The protocol roles disclosed through discover-features (profile §3). */
    export enum {X}Role {{
    {roles_enum}
    }}

    export enum {X}State {{{states}
    }}

    export enum {X}EventTypes {{
      {X}StateChanged = '{X}StateChanged',
    }}

    /** Emitted on every state change of a `{X}Record`; `previousState` is null when the record is created. */
    export interface {X}StateChangedEvent extends BaseEvent {{
      type: typeof {X}EventTypes.{X}StateChanged
      payload: {{
        record: {X}Record
        previousState: {X}State | null
      }}
    }}
  ''')

  resp_fields_props = f'''
      response?: {X}Response''' if hasResponse else ''
  resp_fields_class = f'''
      /** The `{P['responseType']}` as sent or received. */
      public response?: {X}Response
    ''' if hasResponse else ''
  resp_import = f', {X}Response' if hasResponse else ''
  w(f'{d}/src/repository/{X}Record.ts', f'''
    import type {{ RecordTags, TagsBase }} from '@credo-ts/core'

    import {{ BaseRecord, CredoError, utils }} from '@credo-ts/core'

    import type {{ {X}Request{resp_import} }} from '../fields'
    import {{ {X}Role, {X}State }} from '../types'

    export type Default{X}Tags = {{
      /** The `@id` of the `request`, the thread id of the exchange. */
      threadId: string
      /** The flow id (`~thread.pthid`) when the exchange runs inside an ayni-flow. */
      parentThreadId?: string
      connectionId: string
      role: {X}Role
      state: {X}State
    }}

    export type Custom{X}Tags = TagsBase

    export type {X}Tags = RecordTags<{X}Record>

    export interface {X}StorageProps {{
      id?: string
      createdAt?: Date
      threadId: string
      parentThreadId?: string
      connectionId: string
      role: {X}Role
      state: {X}State
      request: {X}Request{resp_fields_props}
      errorCode?: string
      errorDescription?: string
      tags?: Custom{X}Tags
    }}

    /** One `{P['uri']}` exchange, written on both sides. */
    export class {X}Record extends BaseRecord<Default{X}Tags, Custom{X}Tags> {{
      public static readonly type = '{X}Record'
      public readonly type = {X}Record.type

      public threadId!: string
      public parentThreadId?: string
      public connectionId!: string
      public role!: {X}Role
      public state!: {X}State

      /** The `request` as sent or received. */
      public request!: {X}Request
    {resp_fields_class}
      /** Set with state `failed`: why the exchange failed (`malformed` when the peer's message broke a rule of the profile). */
      public errorCode?: string
      public errorDescription?: string

      public constructor(props: {X}StorageProps) {{
        super()

        if (props) {{
          this.id = props.id ?? utils.uuid()
          this.createdAt = props.createdAt ?? new Date()
          this.threadId = props.threadId
          this.parentThreadId = props.parentThreadId
          this.connectionId = props.connectionId
          this.role = props.role
          this.state = props.state
          this.request = props.request{"""
          this.response = props.response""" if hasResponse else ''}
          this.errorCode = props.errorCode
          this.errorDescription = props.errorDescription
          this._tags = props.tags ?? {{}}
        }}
      }}

      public getTags(): Default{X}Tags & Custom{X}Tags {{
        return {{
          ...this._tags,
          threadId: this.threadId,
          parentThreadId: this.parentThreadId,
          connectionId: this.connectionId,
          role: this.role,
          state: this.state,
        }}
      }}

      /** The flow id, when the exchange runs inside an ayni-flow. */
      public get flowId(): string | undefined {{
        return this.parentThreadId
      }}

      public assertState(expected: {X}State | {X}State[]): void {{
        const states = Array.isArray(expected) ? expected : [expected]
        if (!states.includes(this.state)) {{
          throw new CredoError(`{name}: exchange '${{this.threadId}}' is in state ${{this.state}}, expected ${{states.join(' | ')}}`)
        }}
      }}

      public assertRole(expected: {X}Role): void {{
        if (this.role !== expected) {{
          throw new CredoError(`{name}: exchange '${{this.threadId}}' has role ${{this.role}}, expected ${{expected}}`)
        }}
      }}
    }}
  ''')
  w(f'{d}/src/repository/{X}Repository.ts', f'''
    import type {{ AgentContext, StorageService }} from '@credo-ts/core'

    import {{ EventEmitter, InjectionSymbols, Repository, inject, injectable }} from '@credo-ts/core'

    import {{ {X}Record }} from './{X}Record'

    @injectable()
    export class {X}Repository extends Repository<{X}Record> {{
      public constructor(
        @inject(InjectionSymbols.StorageService) storageService: StorageService<{X}Record>,
        eventEmitter: EventEmitter
      ) {{
        super({X}Record, storageService, eventEmitter)
      }}

      /** The record of a `request` id. */
      public findByThreadId(agentContext: AgentContext, threadId: string) {{
        return this.findSingleByQuery(agentContext, {{ threadId }})
      }}

      /** The exchanges that ran inside one ayni-flow. */
      public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {{
        return this.findByQuery(agentContext, {{ parentThreadId }})
      }}

      public findByConnectionId(agentContext: AgentContext, connectionId: string) {{
        return this.findByQuery(agentContext, {{ connectionId }})
      }}
    }}
  ''')
  w(f'{d}/src/repository/index.ts', f'''
    export * from './{X}Record'
    export * from './{X}Repository'
  ''')

  w(f'{d}/src/{X}ModuleConfig.ts', f'''
    import {{ {X}Role }} from './types'

    export interface {X}ModuleConfigOptions {{
      /**
       * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
       * `{P['roles'][1][1]}`; a Verifiable Service discloses `{P['roles'][0][1]}`. A service may NOT open a kind whose
       * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
       */
      roles: {X}Role[]
    }}

    export class {X}ModuleConfig {{
      private readonly options: {X}ModuleConfigOptions

      public constructor(options: {X}ModuleConfigOptions) {{
        if (!options?.roles?.length) {{
          throw new Error('{name}: {X}Module needs at least one role')
        }}
        this.options = options
      }}

      public get roles(): {X}Role[] {{
        return this.options.roles
      }}
    }}
  ''')

  # ---- service ----
  if hasResponse:
    response_methods = f'''

      /** Builds the `{P['responseType']}` of a received request after checking it against the profile, and records it sent. */
      public async createResponse(
        agentContext: AgentContext,
        record: {X}Record,
        response: {X}Response
      ): Promise<{{ message: {RC}; record: {X}Record }}> {{
        record.assertRole({X}Role.{P['responder']})
        record.assertState({X}State.RequestReceived)

        const invalid = validateResponse(record.request, response)
        if (invalid) throw new CredoError(`{name}: invalid response: ${{invalid}}`)

        const message = new {RC}({{ ...response, threadId: record.threadId, parentThreadId: record.parentThreadId }})
        record.response = response
        await this.updateState(agentContext, record, {X}State.ResponseSent)
        return {{ message, record }}
      }}

      /**
       * Receives the `{P['responseType']}` of a request we sent. A response that breaks a rule of the profile (for example an
       * attestation `none` on an attested request) fails the exchange with `errorCode` `malformed`; the host sends the flow's
       * problem report.
       */
      public async processResponse(messageContext: DidCommInboundMessageContext<{RC}>): Promise<{X}Record | null> {{
        const {{ message, agentContext }} = messageContext
        const connection = messageContext.assertReadyConnection()

        const record = await this.repository.findByThreadId(agentContext, message.threadId)
        if (!record) {{
          this.logger.debug(`{name}: ignoring response to unknown request '${{message.threadId}}'`)
          return null
        }}
        if (record.connectionId !== connection.id) {{
          this.logger.warn(`{name}: ignoring response to '${{message.threadId}}' from another connection`)
          return null
        }}
        if (record.state !== {X}State.RequestSent) {{
          this.logger.debug(`{name}: ignoring response to '${{message.threadId}}' in state ${{record.state}}`)
          return null
        }}

        const response = message.toResponse()
        record.response = response
        const invalid = validateResponse(record.request, response)
        if (invalid) {{
          this.logger.warn(`{name}: response to '${{message.threadId}}' is malformed: ${{invalid}}`)
          record.errorCode = 'malformed'
          record.errorDescription = invalid
          await this.updateState(agentContext, record, {X}State.Failed)
          return record
        }}
        await this.updateState(agentContext, record, {X}State.ResponseReceived)
        return record
      }}'''
    service_imports = f'''import {{ {X}RequestMessage, {RC} }} from '../messages'
    import {{ validateRequest, validateResponse }} from '../validation\''''
    fields_import = f'{X}Request, {X}Response'
  else:
    response_methods = f'''

      /** Records that the request was answered, by an `issue` flow or by a problem report (profile {P['spec']}). */
      public async markAnswered(agentContext: AgentContext, record: {X}Record): Promise<{X}Record> {{
        record.assertState([{X}State.RequestSent, {X}State.RequestReceived])
        await this.updateState(agentContext, record, {X}State.Answered)
        return record
      }}'''
    service_imports = f'''import {{ {X}RequestMessage }} from '../messages'
    import {{ validateRequest }} from '../validation\''''
    fields_import = f'{X}Request'

  w(f'{d}/src/services/{X}Service.ts', f'''
    import type {{ AgentContext, Logger, Query, QueryOptions }} from '@credo-ts/core'
    import type {{ DidCommConnectionRecord, DidCommInboundMessageContext }} from '@credo-ts/didcomm'

    import {{ CredoError, EventEmitter, InjectionSymbols, inject, injectable }} from '@credo-ts/core'

    import type {{ {fields_import} }} from '../fields'
    {service_imports}
    import {{ {X}Record, {X}Repository }} from '../repository'
    import {{ {X}EventTypes, {X}Role, {X}State, type {X}StateChangedEvent }} from '../types'

    export interface Create{X}RequestOptions {{
      connection: DidCommConnectionRecord
      /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
      parentThreadId?: string
      request: {X}Request
    }}

    /** State machine of one `{P['uri']}` exchange; builds the wire messages, never sends them (sending is `{X}Api`). */
    @injectable()
    export class {X}Service {{
      public constructor(
        private readonly repository: {X}Repository,
        private readonly eventEmitter: EventEmitter,
        @inject(InjectionSymbols.Logger) private readonly logger: Logger
      ) {{}}

      /** Builds a `request` after checking it against the profile and records it sent. */
      public async createRequest(
        agentContext: AgentContext,
        options: Create{X}RequestOptions
      ): Promise<{{ message: {X}RequestMessage; record: {X}Record }}> {{
        const invalid = validateRequest(options.request)
        if (invalid) throw new CredoError(`{name}: invalid request: ${{invalid}}`)

        const message = new {X}RequestMessage({{ ...options.request, parentThreadId: options.parentThreadId }})
        const record = new {X}Record({{
          threadId: message.id,
          parentThreadId: options.parentThreadId,
          connectionId: options.connection.id,
          role: {X}Role.{P['requester']},
          state: {X}State.RequestSent,
          request: options.request,
        }})
        await this.repository.save(agentContext, record)
        this.emitStateChanged(agentContext, record, null)
        return {{ message, record }}
      }}

      /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
      public async processRequest(messageContext: DidCommInboundMessageContext<{X}RequestMessage>): Promise<{X}Record | null> {{
        const {{ message, agentContext }} = messageContext
        const connection = messageContext.assertReadyConnection()

        const existing = await this.repository.findByThreadId(agentContext, message.id)
        if (existing) {{
          this.logger.debug(`{name}: ignoring replayed request '${{message.id}}'`)
          return null
        }}

        const request = message.toRequest()
        const invalid = validateRequest(request)
        const record = new {X}Record({{
          threadId: message.id,
          parentThreadId: message.thread?.parentThreadId,
          connectionId: connection.id,
          role: {X}Role.{P['responder']},
          state: invalid ? {X}State.Failed : {X}State.RequestReceived,
          request,
          ...(invalid ? {{ errorCode: 'malformed', errorDescription: invalid }} : {{}}),
        }})
        if (invalid) this.logger.warn(`{name}: request '${{message.id}}' is malformed: ${{invalid}}`)
        await this.repository.save(agentContext, record)
        this.emitStateChanged(agentContext, record, null)
        return record
      }}{response_methods}

      /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
      public async fail(agentContext: AgentContext, record: {X}Record, code: string, description?: string): Promise<{X}Record> {{
        record.errorCode = code
        record.errorDescription = description
        await this.updateState(agentContext, record, {X}State.Failed)
        return record
      }}

      public getById(agentContext: AgentContext, id: string) {{
        return this.repository.getById(agentContext, id)
      }}

      public findById(agentContext: AgentContext, id: string) {{
        return this.repository.findById(agentContext, id)
      }}

      public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<{X}Record> {{
        const record = await this.repository.findByThreadId(agentContext, threadId)
        if (!record) throw new CredoError(`{name}: no exchange '${{threadId}}'`)
        return record
      }}

      public findByThreadId(agentContext: AgentContext, threadId: string) {{
        return this.repository.findByThreadId(agentContext, threadId)
      }}

      public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {{
        return this.repository.findByParentThreadId(agentContext, parentThreadId)
      }}

      public findAllByQuery(agentContext: AgentContext, query: Query<{X}Record>, queryOptions?: QueryOptions) {{
        return this.repository.findByQuery(agentContext, query, queryOptions)
      }}

      private async updateState(agentContext: AgentContext, record: {X}Record, state: {X}State): Promise<void> {{
        const previousState = record.state
        record.state = state
        await this.repository.update(agentContext, record)
        this.emitStateChanged(agentContext, record, previousState)
      }}

      private emitStateChanged(agentContext: AgentContext, record: {X}Record, previousState: {X}State | null) {{
        this.eventEmitter.emit<{X}StateChangedEvent>(agentContext, {{
          type: {X}EventTypes.{X}StateChanged,
          payload: {{ record: record.clone(), previousState }},
        }})
      }}
    }}
  ''')
  w(f'{d}/src/services/index.ts', f"export * from './{X}Service'\n")

  # ---- handlers ----
  w(f'{d}/src/handlers/{X}RequestHandler.ts', f'''
    import type {{ DidCommMessageHandler, DidCommMessageHandlerInboundMessage }} from '@credo-ts/didcomm'

    import {{ {X}RequestMessage }} from '../messages'
    import type {{ {X}Service }} from '../services'

    export class {X}RequestHandler implements DidCommMessageHandler {{
      public supportedMessages = [{X}RequestMessage]

      public constructor(private readonly service: {X}Service) {{}}

      public async handle(messageContext: DidCommMessageHandlerInboundMessage<{X}RequestHandler>) {{
        await this.service.processRequest(messageContext)
        return undefined
      }}
    }}
  ''')
  handlers_index = f"export * from './{X}RequestHandler'\n"
  if hasResponse:
    w(f'{d}/src/handlers/{X}ResponseHandler.ts', f'''
      import type {{ DidCommMessageHandler, DidCommMessageHandlerInboundMessage }} from '@credo-ts/didcomm'

      import {{ {RC} }} from '../messages'
      import type {{ {X}Service }} from '../services'

      export class {X}ResponseHandler implements DidCommMessageHandler {{
        public supportedMessages = [{RC}]

        public constructor(private readonly service: {X}Service) {{}}

        public async handle(messageContext: DidCommMessageHandlerInboundMessage<{X}ResponseHandler>) {{
          await this.service.processResponse(messageContext)
          return undefined
        }}
      }}
    ''')
    handlers_index += f"export * from './{X}ResponseHandler'\n"
  w(f'{d}/src/handlers/index.ts', handlers_index)

  # ---- api ----
  if hasResponse:
    api_response = f'''

      /** Answers a received request with the `{P['responseType']}` (profile {P['spec']}); throws when the response breaks a rule of the profile. */
      public async respond(options: Respond{X}Options): Promise<{X}Record> {{
        const record = await this.service.getByThreadId(this.agentContext, options.threadId)
        const {{ message }} = await this.service.createResponse(this.agentContext, record, options.response)
        await this.send(record.connectionId, message, record)
        return record
      }}'''
    api_types = f'''
    export interface Respond{X}Options {{
      /** The `@id` of the request being answered. */
      threadId: string
      response: {X}Response
    }}
    '''
    fields_import_api = f'{X}Request, {X}Response'
  else:
    api_response = f'''

      /** Records that the request was answered, by an `issue` flow or by a problem report, on either side. */
      public async markAnswered(threadId: string): Promise<{X}Record> {{
        const record = await this.service.getByThreadId(this.agentContext, threadId)
        return this.service.markAnswered(this.agentContext, record)
      }}'''
    api_types = ''
    fields_import_api = f'{X}Request'
  w(f'{d}/src/{X}Api.ts', f'''
    import type {{ Query, QueryOptions }} from '@credo-ts/core'
    import type {{ DidCommMessage }} from '@credo-ts/didcomm'

    import {{ AgentContext, injectable }} from '@credo-ts/core'
    import {{ DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext }} from '@credo-ts/didcomm'

    import type {{ {fields_import_api} }} from './fields'
    import type {{ {X}Record }} from './repository'
    import {{ {X}Service }} from './services'

    export interface Send{X}RequestOptions {{
      connectionId: string
      /** The flow id when the exchange runs inside an ayni-flow: set as `~thread.pthid` on every message (profile §2). */
      parentThreadId?: string
      request: {X}Request
    }}
    {api_types}
    /** `{P['uri']}` (Ayni Flow Profile 1.0 {P['spec']}). */
    @injectable()
    export class {X}Api {{
      public constructor(
        private readonly agentContext: AgentContext,
        private readonly service: {X}Service,
        private readonly messageSender: DidCommMessageSender,
        private readonly connectionService: DidCommConnectionService
      ) {{}}

      /** Sends a `request`; the record's `threadId` is the request id the response answers. */
      public async request(options: Send{X}RequestOptions): Promise<{X}Record> {{
        const connection = await this.connectionService.getById(this.agentContext, options.connectionId)
        connection.assertReady()

        const {{ message, record }} = await this.service.createRequest(this.agentContext, {{
          connection,
          parentThreadId: options.parentThreadId,
          request: options.request,
        }})
        await this.send(connection.id, message, record)
        return record
      }}{api_response}

      /** Records a failure decided by the host (the person declined, the flow was refused...). */
      public async fail(threadId: string, code: string, description?: string): Promise<{X}Record> {{
        const record = await this.service.getByThreadId(this.agentContext, threadId)
        return this.service.fail(this.agentContext, record, code, description)
      }}

      public getById(id: string): Promise<{X}Record> {{
        return this.service.getById(this.agentContext, id)
      }}

      public findById(id: string): Promise<{X}Record | null> {{
        return this.service.findById(this.agentContext, id)
      }}

      public getByThreadId(threadId: string): Promise<{X}Record> {{
        return this.service.getByThreadId(this.agentContext, threadId)
      }}

      public findByThreadId(threadId: string): Promise<{X}Record | null> {{
        return this.service.findByThreadId(this.agentContext, threadId)
      }}

      /** The exchanges that ran inside one ayni-flow. */
      public findByFlowId(flowId: string): Promise<{X}Record[]> {{
        return this.service.findByParentThreadId(this.agentContext, flowId)
      }}

      public findAllByQuery(query: Query<{X}Record>, queryOptions?: QueryOptions): Promise<{X}Record[]> {{
        return this.service.findAllByQuery(this.agentContext, query, queryOptions)
      }}

      private async send(connectionId: string, message: DidCommMessage, associatedRecord: {X}Record): Promise<void> {{
        const connectionRecord = await this.connectionService.getById(this.agentContext, connectionId)
        const outbound = await getOutboundDidCommMessageContext(this.agentContext, {{
          message,
          connectionRecord,
          associatedRecord,
        }})
        await this.messageSender.sendMessage(outbound)
      }}
    }}
  ''')

  handlers_new = f'new {X}RequestHandler(service)' + (f', new {X}ResponseHandler(service)' if hasResponse else '')
  handlers_imp = f'{X}RequestHandler' + (f', {X}ResponseHandler' if hasResponse else '')
  w(f'{d}/src/{X}Module.ts', f'''
    import type {{ AgentContext, DependencyManager, Module }} from '@credo-ts/core'

    import {{ DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol }} from '@credo-ts/didcomm'

    import {{ {X}Api }} from './{X}Api'
    import {{ {X}ModuleConfig, type {X}ModuleConfigOptions }} from './{X}ModuleConfig'
    import {{ {handlers_imp} }} from './handlers'
    import {{ {U}_PROTOCOL_URI }} from './messages'
    import {{ {X}Repository }} from './repository'
    import {{ {X}Service }} from './services'

    /** Credo module for `{P['uri']}` (Ayni Flow Profile 1.0 {P['spec']}). */
    export class {X}Module implements Module {{
      public readonly api = {X}Api
      public readonly config: {X}ModuleConfig

      public constructor(options: {X}ModuleConfigOptions) {{
        this.config = new {X}ModuleConfig(options)
      }}

      public register(dependencyManager: DependencyManager): void {{
        dependencyManager.registerInstance({X}ModuleConfig, this.config)
        dependencyManager.registerContextScoped({X}Api)
        dependencyManager.registerSingleton({X}Repository)
        dependencyManager.registerSingleton({X}Service)
      }}

      public async initialize(agentContext: AgentContext): Promise<void> {{
        const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
        const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
        const service = agentContext.dependencyManager.resolve({X}Service)

        messageHandlerRegistry.registerMessageHandlers([{handlers_new}])
        featureRegistry.register(new DidCommProtocol({{ id: {U}_PROTOCOL_URI, roles: this.config.roles }}))
      }}
    }}
  ''')
  api_type_exports = f"export type {{ Respond{X}Options, Send{X}RequestOptions }} from './{X}Api'" if hasResponse else f"export type {{ Send{X}RequestOptions }} from './{X}Api'"
  w(f'{d}/src/index.ts', f'''
    export {{ {X}Api }} from './{X}Api'
    {api_type_exports}
    export {{ {X}Module }} from './{X}Module'
    export {{ {X}ModuleConfig }} from './{X}ModuleConfig'
    export type {{ {X}ModuleConfigOptions }} from './{X}ModuleConfig'
    export * from './handlers'
    export * from './messages'
    export * from './repository'
    export * from './services'
    export * from './types'
    export * from './validation'
  ''')
  print('generated', name)

for name in (sys.argv[1:] or PACKAGES.keys()):
  gen(name)
