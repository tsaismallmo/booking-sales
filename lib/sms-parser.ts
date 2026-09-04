// 解析漢來美食系統發出的簡訊，抓出可以拿來建立/更新單據的欄位。
// 兩種格式：
// 1) 付款通知：「感謝預訂...，YYYY-MM-DD，HH:MM，共N位，訂位代號X，...請於YYYY-MM-DD前完成付款。<連結>」
// 2) 付款完成：「您預訂...YYYY-MM-DD，HH:MM，共N位，訂位代號X，已於YY/MM/DD HH:MM:SS完成預約付款，交易成功金額為N元，訂金單號為X。」

export type ParsedBookingNotice = {
  type: 'booking_notice'
  branch: string | null
  bookingDate: string | null
  timeSlot: string | null
  partySize: number | null
  bookingCode: string | null
  paymentDeadline: string | null
  paymentLink: string | null
}

export type ParsedPaymentCompletion = {
  type: 'payment_completion'
  branch: string | null
  bookingDate: string | null
  timeSlot: string | null
  partySize: number | null
  bookingCode: string | null
  paidAt: string | null
  amount: number | null
  transactionNo: string | null
}

export type ParsedSms = ParsedBookingNotice | ParsedPaymentCompletion | { type: 'unknown' }

const DATE_RE = /(\d{4}-\d{2}-\d{2})/
const TIME_RE = /(\d{2}:\d{2})/
const PARTY_RE = /共(\d+)位/
const CODE_RE = /訂位代號(\d+)/
const LINK_RE = /(https?:\/\/\S+)/

export function parseSms(text: string): ParsedSms {
  const trimmed = text.trim()

  if (trimmed.includes('完成預約付款')) {
    const paidAtMatch = trimmed.match(/已於\s*([\d/]+\s[\d:]+)\s*完成預約付款/)
    const amountMatch = trimmed.match(/金額為(\d+)元/)
    const txnMatch = trimmed.match(/訂金單號為([A-Za-z0-9]+)/)
    const branchMatch = trimmed.match(/您預訂(.+?)\d{4}-\d{2}-\d{2}/)

    return {
      type: 'payment_completion',
      branch: branchMatch ? branchMatch[1].trim() : null,
      bookingDate: trimmed.match(DATE_RE)?.[1] ?? null,
      timeSlot: trimmed.match(TIME_RE)?.[1] ?? null,
      partySize: trimmed.match(PARTY_RE) ? Number(trimmed.match(PARTY_RE)![1]) : null,
      bookingCode: trimmed.match(CODE_RE)?.[1] ?? null,
      paidAt: paidAtMatch ? normalizeTwoDigitYearDateTime(paidAtMatch[1]) : null,
      amount: amountMatch ? Number(amountMatch[1]) : null,
      transactionNo: txnMatch ? txnMatch[1] : null,
    }
  }

  if (trimmed.includes('感謝預訂')) {
    const branchMatch = trimmed.match(/感謝預訂(.+?)\d{4}-\d{2}-\d{2}/)
    const deadlineMatch = trimmed.match(/請於(\d{4}-\d{2}-\d{2})前完成付款/)

    return {
      type: 'booking_notice',
      branch: branchMatch ? branchMatch[1].trim() : null,
      bookingDate: trimmed.match(DATE_RE)?.[1] ?? null,
      timeSlot: trimmed.match(TIME_RE)?.[1] ?? null,
      partySize: trimmed.match(PARTY_RE) ? Number(trimmed.match(PARTY_RE)![1]) : null,
      bookingCode: trimmed.match(CODE_RE)?.[1] ?? null,
      paymentDeadline: deadlineMatch ? deadlineMatch[1] : null,
      paymentLink: trimmed.match(LINK_RE)?.[1] ?? null,
    }
  }

  return { type: 'unknown' }
}

// "26/08/13 16:54:55" -> "2026-08-13 16:54:55"
function normalizeTwoDigitYearDateTime(s: string) {
  const [datePart, timePart] = s.split(/\s+/)
  const [yy, mm, dd] = datePart.split('/')
  const year = Number(yy) < 70 ? `20${yy}` : `19${yy}`
  return `${year}-${mm}-${dd} ${timePart}`
}
