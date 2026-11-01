import { SIGN_TX_BROADCASTERS, type SignTxRequest, type SignTxResponse } from './fields'

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** The rules of profile §6.9 / FLOW-SIGN-001 on a request; returns the first violation or undefined. */
export function validateRequest(request: SignTxRequest): string | undefined {
  if (typeof request.chainId !== 'string' || !request.chainId) return 'chain_id is required'
  const doc = request.signDoc
  if (!doc) return 'sign_doc is required'
  if (typeof doc.bodyBytes !== 'string' || !BASE64.test(doc.bodyBytes)) return 'sign_doc.body_bytes must be base64'
  if (typeof doc.authInfoBytes !== 'string' || !BASE64.test(doc.authInfoBytes))
    return 'sign_doc.auth_info_bytes must be base64'
  if (typeof doc.accountNumber !== 'string' || !/^\d+$/.test(doc.accountNumber))
    return 'sign_doc.account_number must be a number string'
  if (!request.summary || typeof request.summary !== 'object' || Array.isArray(request.summary))
    return 'summary must be an object'
  if (!SIGN_TX_BROADCASTERS.includes(request.broadcast))
    return `broadcast must be one of ${SIGN_TX_BROADCASTERS.join(', ')}`
  return undefined
}

/**
 * On a response (profile §6.9, FLOW-SIGN-002): `signed` carries the signature and public key and is the answer when the
 * service broadcasts; `broadcast` adds the `tx_hash` and is the answer when the app broadcasts; `failed` carries the chain's reason.
 */
export function validateResponse(request: SignTxRequest, response: SignTxResponse): string | undefined {
  switch (response.status) {
    case 'signed':
    case 'broadcast': {
      if (!response.signature) return `signature is required when status is ${response.status}`
      if (!response.publicKey?.type || !response.publicKey?.value)
        return `public_key is required when status is ${response.status}`
      if (response.status === 'broadcast') {
        if (request.broadcast !== 'app') return "status 'broadcast' is only valid when the request said broadcast: app"
        if (!response.txHash) return 'tx_hash is required when status is broadcast'
      } else if (request.broadcast !== 'service') {
        return "status 'signed' is only valid when the request said broadcast: service"
      }
      return undefined
    }
    case 'failed':
      return undefined
    default:
      return `status must be one of signed, broadcast, failed`
  }
}
