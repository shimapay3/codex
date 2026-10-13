import { TxEntry, formatAmount } from './solana'
import { readLocal, writeLocal } from './storage'
import { fullDateTime, formatVnd } from './format'

const WEBHOOK_SENT_KEY = 'webhook-sent.v1'

type WebhookSentRecord = Record<string, number>

/** Read all webhook-sent signatures from localStorage. */
export function getWebhookSentSignatures(): Set<string> {
  const record = readLocal<WebhookSentRecord>(WEBHOOK_SENT_KEY, {})
  return new Set(Object.keys(record))
}

/** Check whether a webhook has already been sent for this transaction signature. */
export function isWebhookSent(signature: string): boolean {
  const record = readLocal<WebhookSentRecord>(WEBHOOK_SENT_KEY, {})
  return signature in record
}

/** Mark a transaction signature as webhook-sent in localStorage. */
export function markWebhookSent(signature: string) {
  const record = readLocal<WebhookSentRecord>(WEBHOOK_SENT_KEY, {})
  record[signature] = Date.now()
  writeLocal(WEBHOOK_SENT_KEY, record)
  window.dispatchEvent(new CustomEvent('webhook-sent', { detail: signature }))
}

export type ParsedTopic = { chatId: string; threadId: number | null }

/**
 * Parse a Telegram topic URL like `https://t.me/c/1234567890/42` into the
 * chat_id and message_thread_id needed by the Bot API sendMessage call.
 */
export function parseTopicUrl(url: string): ParsedTopic | null {
  try {
    const u = new URL(url.trim())
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] === 'c' && parts[1] && /^\d+$/.test(parts[1])) {
        const chatId = '-100' + parts[1]
        const threadId = parts[2] && /^\d+$/.test(parts[2]) ? Number(parts[2]) : null
        return { chatId, threadId }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Build a rich HTML message with full transaction details for the Telegram topic. */
export function buildTxMessage(
  entry: TxEntry,
  walletName: string,
  walletAddress: string,
  contactName?: string,
): string {
  const direction =
    entry.direction === 'in' ? '📥 Nhận' : entry.direction === 'out' ? '📤 Gửi' : '🔄 Giao dịch'
  const status = entry.status === 'success' ? '✅ Thành công' : '❌ Thất bại'
  const time = entry.blockTime ? fullDateTime(entry.blockTime) : 'Không xác định'
  const counterparty = entry.counterparty || 'Không xác định'

  return [
    '🔔 <b>Giao dịch 💠 USDC</b>',
    '',
    `<b>Ví:</b> ${walletName}`,
    `<b>Địa chỉ:</b> <code>${walletAddress}</code>`,
    `<b>Loại:</b> ${direction}`,
    `<b>Số lượng:</b> 💠 ${formatAmount(entry.amount, entry.amount < 1 ? 4 : 2)} USDC (≈ ${formatVnd(entry.amount * 30000)})`,
    `<b>Trạng thái:</b> ${status}`,
    entry.memo ? `<b>Memo:</b> ${entry.memo}` : '',
    contactName
      ? `👤 <b>Danh bạ:</b> <b>${contactName}</b>`
      : `<b>Đối tác:</b> <code>${counterparty}</code>`,
    `<b>Địa chỉ đối tác:</b> <code>${counterparty}</code>`,
    `<b>Thời gian:</b> ${time}`,
    `<b>Slot:</b> ${entry.slot}`,
    `<b>Chữ ký:</b> <code>${entry.signature}</code>`,
    `<b>Explorer:</b> ${entry.explorerUrl}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Send a message to a Telegram topic via the server proxy.
 * The server acts as a CORS-safe relay to the Telegram Bot API.
 */
export async function sendWebhook(
  botToken: string,
  topicUrl: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken.trim()) return { ok: false, error: 'Chưa nhập Telegram bot token' }
  if (!topicUrl.trim()) return { ok: false, error: 'Chưa nhập link thread topic' }

  try {
    const res = await fetch('/api/webhook/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ botToken: botToken.trim(), topicUrl: topicUrl.trim(), text }),
    })
    const json = await res.json()
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error || json.description || 'Gửi webhook thất bại' }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối' }
  }
}

/** Send a test message to verify the webhook configuration. */
export async function sendTestWebhook(
  botToken: string,
  topicUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = [
    '🧪 <b>Test Webhook</b> 💠',
    '',
    'XPay Wallet · Cloud Chain',
    `Thời gian: ${fullDateTime(Math.floor(Date.now() / 1000))}`,
    '✅ Webhook hoạt động bình thường',
  ].join('\n')
  return sendWebhook(botToken, topicUrl, text)
}
