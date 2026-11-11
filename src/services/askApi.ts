import { requestNoContent } from './apiClient'

export type AskPayload = {
  question: string
  replyEmail: string
  name?: string
  honeypot: string
  pagePath: string
}

export function sendAsk(payload: AskPayload): Promise<void> {
  return requestNoContent('/api/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
