/**
 * Text hygiene before anything reaches the LLM. Stripping quoted history is the
 * single biggest cost lever: threads repeat every previous message in each reply.
 * Patterns cover Outlook in English and French, the two languages expected in the dump.
 */

const SUBJECT_PREFIX = /^\s*((re|tr|fw|fwd|aw|wg|rép|réf)\s*(\[\d+\])?\s*:\s*|\[(ext|external|externe)\]\s*|\*{2,}\s*[a-z]+\s*\*{2,}\s*)/i

export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(SUBJECT_PREFIX, '').trim()
  }
  return s.toLowerCase().replace(/\s+/g, ' ')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// A line that starts the quoted previous message.
const QUOTE_STARTS: RegExp[] = [
  /^-{2,}\s*(original message|message d['’]origine|forwarded message|message transféré)\s*-{2,}/i,
  /^_{8,}\s*$/,
  /^(on|le)\s.{5,200}(wrote|a écrit)\s*:\s*$/i,
]
// Outlook header block: "From: …" followed shortly by "Sent:/Date:/Envoyé :".
const HEADER_FROM = /^\*?(from|de|von)\s*\*?\s*:\s*\S/i
const HEADER_NEXT = /^\*?(sent|envoyé|date|gesendet|to|à)\s*\*?\s*:/i

const SIGNATURE_STARTS: RegExp[] = [
  /^--\s*$/,
  /^(this (e-?mail|message) (and any|is confidential|contains))/i,
  /^(ce (message|courriel|mail) (et|est|ainsi)|les informations contenues dans ce)/i,
  /^(sent from my|envoyé de mon|envoyé depuis|envoyé à partir de|get outlook for)/i,
]
const CLOSINGS = /^(cordialement|bien cordialement|bien à vous|salutations|best regards|kind regards|regards|thanks and regards|br|cdlt|cdt|cr|bàv|merci et bonne journée|bonne journée)[\s,.!]*$/i

// Lines that carry no knowledge but repeat in every quoted message: external-mail banners,
// Teams join blocks, legal footers, inline image placeholders.
const BOILERPLATE = /^(avertissement\s*:\s*cet e-?mail provient de l'extérieur|caution\s*:\s*external email|\[cid:|réunion microsoft teams|rejoindre\s*:\s*https:\/\/teams|numéro de réunion|participer par téléphone|trouver un numéro local|numéro de conférence|pour les organisateurs|besoin d'aide \?|aide de l'organisation|imprimer utile|the information in this email is confidential|_{20,}$)/i

const MAX_MESSAGE_CHARS = 6000

/** Outlook leaves "<mailto:x@y> @Name" mentions and "<https://…>" link targets in plain-text bodies. */
function tidy(body: string): string {
  return body.replace(/\r\n?/g, '\n').replace(/<mailto:[^>\s]+>\s*/g, '').replace(/<https?:\/\/[^>\s]+>/g, '')
}

export function stripQuotesAndSignature(body: string): string {
  const lines = tidy(body).split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (QUOTE_STARTS.some(r => r.test(line))) break
    if (HEADER_FROM.test(line) && lines.slice(i + 1, i + 5).some(l => HEADER_NEXT.test(l.trim()))) break
    if (SIGNATURE_STARTS.some(r => r.test(line))) break
    if (line.startsWith('>') || BOILERPLATE.test(line)) continue
    // A closing word followed by a short tail is a signature block; keep the closing, drop the tail.
    if (CLOSINGS.test(line) && lines.length - i <= 20) {
      out.push(line)
      break
    }
    out.push(lines[i].trimEnd())
  }

  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > MAX_MESSAGE_CHARS) {
    const dropped = text.length - MAX_MESSAGE_CHARS
    text = text.slice(0, MAX_MESSAGE_CHARS) + `\n[… ${dropped} more characters not included]`
  }
  return text
}

const MAX_HISTORY_CHARS = 15000

/**
 * The quoted / forwarded history under a message's own text. Forwards and short replies
 * ("++ @x", "DAT ci-joint") carry their substance there, and the earlier messages are
 * often not in the mailbox at all. Returned without "> " prefixes and disclaimers.
 */
export function quotedHistory(body: string): string {
  const lines = tidy(body).split('\n')
  let start = -1
  for (let i = 0; i < lines.length && start < 0; i++) {
    const line = lines[i].trim()
    if (QUOTE_STARTS.some(r => r.test(line))) start = i
    else if (HEADER_FROM.test(line) && lines.slice(i + 1, i + 5).some(l => HEADER_NEXT.test(l.trim()))) start = i
    else if (line.startsWith('>')) start = i
  }
  if (start < 0) return ''
  const out = lines.slice(start).map(l => l.replace(/^(\s*>)+\s?/, ''))
    .filter(l => !SIGNATURE_STARTS.slice(1).some(r => r.test(l.trim())) && !BOILERPLATE.test(l.trim()))
  let text = out.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > MAX_HISTORY_CHARS) text = text.slice(0, MAX_HISTORY_CHARS) + `\n[… ${text.length - MAX_HISTORY_CHARS} more characters of history not included]`
  return text
}

/**
 * The sender's signature block (name, title, department) from the message's own
 * part, before any quoted history. It is the best source for "which department".
 */
export function extractSignature(body: string): string | null {
  const lines = body.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim())
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (QUOTE_STARTS.some(r => r.test(line)) || HEADER_FROM.test(line)) return null
    if (CLOSINGS.test(line) || /^--\s*$/.test(line)) {
      const tail: string[] = []
      for (const l of lines.slice(i + 1)) {
        if (QUOTE_STARTS.some(r => r.test(l)) || HEADER_FROM.test(l) || SIGNATURE_STARTS.slice(1).some(r => r.test(l))) break
        if (l) tail.push(l)
        if (tail.length === 4) break
      }
      const sig = tail.join(' | ').slice(0, 160)
      return sig || null
    }
  }
  return null
}

/**
 * Remove secrets before storage or any API call. The KB must say how to get
 * credentials, never contain them. Errs on the side of over-redacting.
 */
const SECRET_LABEL = '(password|passwd|pwd|mot de passe|mdp|passphrase|secret|token|api[ _-]?key|clé|cle|pin|login\\s*/\\s*password)'

export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED-PRIVATE-KEY]')
    // label: value   (same line)
    .replace(new RegExp(`\\b${SECRET_LABEL}(\\s*(?:temporaire|provisoire|initial|temporary)?\\s*[:=]\\s*)(\\S+)`, 'gi'),
      (_m, label: string, sep: string) => `${label}${sep}[REDACTED-SECRET]`)
    // label alone on a line, value on the next line
    .replace(new RegExp(`(^|\\n)(\\s*${SECRET_LABEL}\\s*[:=]?\\s*)\\n(\\s*)(\\S+)`, 'gi'),
      (_m, pre: string, label: string, _l: string, indent: string) => `${pre}${label}\n${indent}[REDACTED-SECRET]`)
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]{16,}=*/g, 'Bearer [REDACTED-TOKEN]')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED-AWS-KEY]')
    // Subscriber numbers (MSISDN, Moroccan 212 + 9 digits) are customer data, useless for routing.
    .replace(/(?<!\d)212[5-7]\d{8}(?!\d)/g, '[MSISDN]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED-JWT]')
    // long random-looking strings: mixed case + digits, no path/url characters
    .replace(/(?<![\w/.@-])(?=[A-Za-z0-9+_!$%*#-]{20,}(?![\w/.@]))(?=[^\s]*[a-z])(?=[^\s]*[A-Z])(?=[^\s]*\d)[A-Za-z0-9+_!$%*#-]{20,}/g, '[REDACTED-TOKEN]')
}

const NOISE_SENDER = new RegExp(process.env.KB_NOISE_SENDERS
  ?? '(no-?reply|do-?not-?reply|mailer-daemon|postmaster|newsletter|news@|marketing|notifications?@linkedin|calendar-notification)', 'i')
const NOISE_SUBJECT = /^(accepted|declined|tentative|accepté|refusé|provisoire|automatic reply|réponse automatique|out of office|absent|absence|undeliverable|non remis|delivery status notification|read:|lu\s*:|invitation\s*:|updated invitation|canceled|annulé)/i
const NOISE_BODY = /(unsubscribe|se désabonner|désinscri|view this email in your browser|afficher cet e-mail dans votre navigateur)/i

export function noiseReason(m: { from: string; subject: string; body: string; messageClass?: string }): string | null {
  if (m.messageClass && !/^IPM\.Note/i.test(m.messageClass)) return `class:${m.messageClass}`
  if (NOISE_SENDER.test(m.from)) return 'sender'
  if (NOISE_SUBJECT.test(m.subject.trim())) return 'subject'
  if (NOISE_BODY.test(m.body)) return 'newsletter'
  return null
}

export function estimateTokens(text: string): number {
  // French/English mail text averages ~3.5 characters per token.
  return Math.ceil(text.length / 3.5)
}
