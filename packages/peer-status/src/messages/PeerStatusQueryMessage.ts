import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'

import { PEER_STATUS_QUERY_TYPE } from './PeerStatusProtocol'

/** `peer-status/1.0/query` (profile §4.1): a receiver that holds no status asks for it; no body. */
export class PeerStatusQueryMessage extends DidCommMessage {
  public constructor(options?: { id?: string }) {
    super()
    this.id = options?.id ?? this.generateId()
  }

  public static readonly type = parseMessageType(PEER_STATUS_QUERY_TYPE)
  @IsValidMessageType(PeerStatusQueryMessage.type)
  public readonly type = PeerStatusQueryMessage.type.messageTypeUri
}
