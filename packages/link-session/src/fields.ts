import { IsIn, IsString } from 'class-validator'

export const LINK_SESSION_PLATFORMS = ['web', 'ios', 'android'] as const
export type LinkSessionPlatform = (typeof LINK_SESSION_PLATFORMS)[number]

export interface LinkSessionAgent {
  did: string
  name: string
}

export interface LinkSessionBrowser {
  description: string
  platform: LinkSessionPlatform
}

/** The `request` body of link-session/1.0 (profile §6.7, FLOW-LINK-001). */
export interface LinkSessionRequest {
  agent: LinkSessionAgent
  browser: LinkSessionBrowser
  webOrigin: string
  /** ISO 8601 */
  startedAt: string
  /** The out-of-band invitation `@id` the holder accepted or reused. */
  invitationId: string
  /** Three distinct short codes for a known-device re-link (PROF-BIND-009), one of which the browser shows; else null. */
  codes?: string[] | null
}

/** The `response` body of link-session/1.0: the agent binds the session on `link: true` and, when `codes` was set, a matching `code`. */
export interface LinkSessionResponse {
  link: boolean
  code?: string | null
}

export class LinkSessionAgentModel implements LinkSessionAgent {
  public constructor(options?: LinkSessionAgent) {
    if (options) {
      this.did = options.did
      this.name = options.name
    }
  }

  @IsString()
  public did!: string

  @IsString()
  public name!: string
}

export class LinkSessionBrowserModel implements LinkSessionBrowser {
  public constructor(options?: LinkSessionBrowser) {
    if (options) {
      this.description = options.description
      this.platform = options.platform
    }
  }

  @IsString()
  public description!: string

  @IsIn(LINK_SESSION_PLATFORMS)
  public platform!: LinkSessionPlatform
}
