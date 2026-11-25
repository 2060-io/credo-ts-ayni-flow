import { Type } from 'class-transformer'
import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

/** How the notifier identifies the receiver (profile §4.1): nothing asked, an authentication it may complete, one it must. */
export const PEER_STATUS_RULES = ['none', 'optional', 'required'] as const
export type PeerStatusRule = (typeof PEER_STATUS_RULES)[number]

/** The types of an authentication method (profile §4.1). A receiver accepts a type it does not know, and cannot complete it. */
export const PEER_STATUS_METHOD_TYPES = [
  'credential',
  'email',
  'document',
  'face-match',
  'authenticator-app',
  'passkey',
] as const
export type PeerStatusMethodType = (typeof PEER_STATUS_METHOD_TYPES)[number]

/** The method types a receiver may enrol with the notifier (profile §6.4), in `enrol` and `enrolled`. */
export const PEER_STATUS_ENROLLABLE_TYPES = ['authenticator-app', 'passkey'] as const
export type PeerStatusEnrollableType = (typeof PEER_STATUS_ENROLLABLE_TYPES)[number]

/** Why a notifier does not serve a receiver (profile §4.1). A receiver accepts a code it does not know. */
export const PEER_STATUS_REFUSAL_CODES = [
  'untrusted',
  'not-admitted',
  'authentication-declined',
  'authentication-unanswered',
] as const
export type PeerStatusRefusalCode = (typeof PEER_STATUS_REFUSAL_CODES)[number]

/** What a status may list as open in this version: the conversation channel. `a2a` and `chat` are reserved. */
export const PEER_STATUS_OPEN_AG_UI = 'ag-ui'

/** The credential a `credential` method asks for, by the JSON schema credential of its schema. */
export interface PeerStatusCredential {
  jsonSchemaCredentialId: string
}

/** One method the notifier accepts (profile §4.1 `authentication.methods.<name>`). */
export interface PeerStatusMethod {
  type: PeerStatusMethodType | string
  /** A `credential` method only: the schema it asks for. */
  credential?: PeerStatusCredential
  /**
   * A `credential` method only: the organizations whose credentials the notifier accepts, by organization key;
   * absent when any accredited issuer of the schema is accepted.
   */
  issuers?: string[]
}

/** How the receiver obtains what it lacks to authenticate, in the notifier's words; a link when there is one. */
export interface PeerStatusObtain {
  text?: string
  url?: string
}

export interface PeerStatusAuthentication {
  rule: PeerStatusRule
  /** The methods the notifier accepts, by the name it gives each; absent with `none`. */
  methods?: Record<string, PeerStatusMethod>
  /**
   * The accepted combinations, each a list of method names: the receiver is identified once every method of one of them
   * completed in one `authenticate` flow (profile §6.14); absent with `none`.
   */
  combinations?: string[][]
  /** Absent when the notifier says nothing of it, and with `none`. */
  obtain?: PeerStatusObtain
  /** The types the receiver may enrol with the notifier (profile §6.4); sent to an identified receiver only. */
  enrol?: (PeerStatusEnrollableType | string)[]
  /** The types the receiver enrolled with the notifier; sent to an identified receiver only. */
  enrolled?: (PeerStatusEnrollableType | string)[]
}

export interface PeerStatusRefusal {
  code: string
  comment?: string
}

/**
 * A credential the notifier issues again to the receiver when the receiver holds none (profile §4.1 `issuable`, §6.11
 * reason `missing`): the JSON schema credential of its schema, and the name a person reads.
 */
export interface PeerStatusIssuable {
  jsonSchemaCredentialId: string
  label: string
}

/**
 * The body of `peer-status/1.0/status` (profile §4.1, FLOW-STAT-001): where the receiver stands with the notifier.
 * A status replaces the one before it.
 */
export interface PeerStatus {
  authentication: PeerStatusAuthentication
  /** Whether the notifier holds a valid identity for the receiver. */
  identified: boolean
  /** What the receiver may use on the connection now; empty when nothing is. */
  open: string[]
  /**
   * The credentials the notifier issues again to the receiver when it holds none (a `reissue` with the reason
   * `missing`, profile §6.11); sent to an identified receiver only, absent when the notifier lists none.
   */
  issuable?: PeerStatusIssuable[]
  /** Present when the notifier does not serve the receiver; `open` is then empty. */
  refusal?: PeerStatusRefusal
}

// ---- wire ---------------------------------------------------------------------------------------

/** A method as it travels: snake_case, as the profile writes it. */
export interface PeerStatusMethodWire {
  type: string
  credential?: { json_schema_credential_id: string }
  issuers?: string[]
}

/** A method as it travels, from the method of the API. */
export function methodToWire(method: PeerStatusMethod): PeerStatusMethodWire {
  return {
    type: method.type,
    ...(method.credential
      ? { credential: { json_schema_credential_id: method.credential.jsonSchemaCredentialId } }
      : {}),
    ...(method.issuers ? { issuers: [...method.issuers] } : {}),
  }
}

/**
 * A method of the API, from what travelled. A value that is not a method is kept as it came, so that the validation
 * names what is wrong with it.
 */
export function methodFromWire(wire: unknown): PeerStatusMethod {
  if (typeof wire !== 'object' || wire === null || Array.isArray(wire)) return wire as PeerStatusMethod
  const { type, credential, issuers } = wire as Partial<PeerStatusMethodWire>
  return {
    type: type as string,
    ...(credential !== undefined
      ? {
          credential:
            typeof credential === 'object' && credential !== null
              ? { jsonSchemaCredentialId: credential.json_schema_credential_id }
              : (credential as unknown as PeerStatusCredential),
        }
      : {}),
    ...(issuers !== undefined ? { issuers: Array.isArray(issuers) ? [...issuers] : issuers } : {}),
  }
}

/** An entry of `issuable` as it travels: snake_case, as the profile writes it. */
export interface PeerStatusIssuableWire {
  json_schema_credential_id: string
  label: string
}

/** An entry of `issuable` as it travels, from the entry of the API. */
export function issuableToWire(issuable: PeerStatusIssuable): PeerStatusIssuableWire {
  return { json_schema_credential_id: issuable.jsonSchemaCredentialId, label: issuable.label }
}

/**
 * An entry of `issuable` of the API, from what travelled. A value that is not an entry is kept as it came, so that the
 * validation names what is wrong with it.
 */
export function issuableFromWire(wire: unknown): PeerStatusIssuable {
  if (typeof wire !== 'object' || wire === null || Array.isArray(wire)) return wire as PeerStatusIssuable
  const { json_schema_credential_id, label } = wire as Partial<PeerStatusIssuableWire>
  return { jsonSchemaCredentialId: json_schema_credential_id as string, label: label as string }
}

export class PeerStatusObtainModel implements PeerStatusObtain {
  public constructor(options?: PeerStatusObtain) {
    if (options) {
      if (options.text !== undefined) this.text = options.text
      if (options.url !== undefined) this.url = options.url
    }
  }

  @IsOptional()
  @IsString()
  public text?: string

  @IsOptional()
  @IsString()
  public url?: string
}

export class PeerStatusAuthenticationModel {
  public constructor(options?: PeerStatusAuthentication) {
    if (options) {
      this.rule = options.rule
      if (options.methods) {
        this.methods = Object.fromEntries(
          Object.entries(options.methods).map(([name, method]) => [name, methodToWire(method)])
        )
      }
      if (options.combinations) this.combinations = options.combinations.map((combination) => [...combination])
      if (options.obtain) this.obtain = new PeerStatusObtainModel(options.obtain)
      if (options.enrol) this.enrol = [...options.enrol]
      if (options.enrolled) this.enrolled = [...options.enrolled]
    }
  }

  @IsIn(PEER_STATUS_RULES)
  public rule!: PeerStatusRule

  /** As it travels (snake_case); `toAuthentication()` gives the API's form. Checked by `validateStatus`. */
  @IsOptional()
  @IsObject()
  public methods?: Record<string, PeerStatusMethodWire>

  @IsOptional()
  @IsArray()
  @IsArray({ each: true })
  public combinations?: string[][]

  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusObtainModel)
  public obtain?: PeerStatusObtainModel

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public enrol?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public enrolled?: string[]

  public toAuthentication(): PeerStatusAuthentication {
    const { methods, combinations, obtain, enrol, enrolled } = this
    return {
      rule: this.rule,
      ...(methods
        ? {
            methods: Object.fromEntries(Object.entries(methods).map(([name, wire]) => [name, methodFromWire(wire)])),
          }
        : {}),
      ...(combinations
        ? {
            combinations: combinations.map((combination) =>
              Array.isArray(combination) ? [...combination] : combination
            ),
          }
        : {}),
      ...(obtain
        ? {
            obtain: {
              ...(obtain.text !== undefined ? { text: obtain.text } : {}),
              ...(obtain.url !== undefined ? { url: obtain.url } : {}),
            },
          }
        : {}),
      ...(enrol ? { enrol: [...enrol] } : {}),
      ...(enrolled ? { enrolled: [...enrolled] } : {}),
    }
  }
}

export class PeerStatusRefusalModel implements PeerStatusRefusal {
  public constructor(options?: PeerStatusRefusal) {
    if (options) {
      this.code = options.code
      if (options.comment !== undefined) this.comment = options.comment
    }
  }

  @IsString()
  public code!: string

  @IsOptional()
  @IsString()
  public comment?: string
}
