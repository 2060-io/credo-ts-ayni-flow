import { Expose } from 'class-transformer'
import { IsIn, IsString } from 'class-validator'

export const SESSION_GRANT_PLATFORMS = ['web', 'ios', 'android'] as const
export type SessionGrantPlatform = (typeof SESSION_GRANT_PLATFORMS)[number]

/** The holder's client description (profile §6.8 `client`). */
export interface SessionGrantClient {
  description: string
  platform: SessionGrantPlatform
  appVersion: string
}

/** The `request` body of session-grant/1.0 (profile §6.8, FLOW-GRANT-001). */
export interface SessionGrantRequest {
  agentDid: string
  /** The conversation to resume, or null. */
  conversationId?: string | null
  newConversation: boolean
  client: SessionGrantClient
}

/** The `grant` body of session-grant/1.0: an opaque single-use grant, valid for at most sixty seconds. */
export interface SessionGrantResponse {
  grant: string
  sessionsUrl: string
  /** ISO 8601 */
  expiresAt: string
}

/** The longest validity of a grant (profile §6.8, FLOW-GRANT-001). */
export const SESSION_GRANT_MAX_VALIDITY_MS = 60_000

export class SessionGrantClientModel implements SessionGrantClient {
  public constructor(options?: SessionGrantClient) {
    if (options) {
      this.description = options.description
      this.platform = options.platform
      this.appVersion = options.appVersion
    }
  }

  @IsString()
  public description!: string

  @IsIn(SESSION_GRANT_PLATFORMS)
  public platform!: SessionGrantPlatform

  @Expose({ name: 'app_version' })
  @IsString()
  public appVersion!: string
}
