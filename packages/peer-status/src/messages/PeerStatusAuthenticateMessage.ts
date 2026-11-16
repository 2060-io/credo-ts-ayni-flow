import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'

import { PEER_STATUS_AUTHENTICATE_TYPE } from './PeerStatusProtocol'

/**
 * `peer-status/1.0/authenticate` (profile §4.1, FLOW-STAT-009): a receiver that is not identified asks the notifier
 * to ask for its credential, when the person wishes; no body. The notifier answers by opening an `authenticate`
 * flow (§6.14).
 */
export class PeerStatusAuthenticateMessage extends DidCommMessage {
  public constructor(options?: { id?: string }) {
    super()
    this.id = options?.id ?? this.generateId()
  }

  public static readonly type = parseMessageType(PEER_STATUS_AUTHENTICATE_TYPE)
  @IsValidMessageType(PeerStatusAuthenticateMessage.type)
  public readonly type = PeerStatusAuthenticateMessage.type.messageTypeUri
}
