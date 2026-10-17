/**
 * Text hygiene before anything reaches the LLM. Stripping quoted history is the
 * single biggest cost lever: threads repeat every previous message in each reply.
 * Patterns cover Outlook in English and French, the two languages expected in the dump.
 */

const SUBJECT_PREFIX = /^\s*((re|tr|fw|fwd|aw|wg|rép|réf)\s*(\[\d+\])?\s*:\s*|\[(ext|external|externe)\]\s*)/i

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
  /^(sent from my|envoyé de mon|envoyé depuis)/i,
]
const CLOSINGS = /^(cordialement|bien cordialement|bien à vous|salutations|best regards|kind regards|regards|thanks and regards|br|cdlt|merci et bonne journée)[\s,.!]*$/i

const MAX_MESSAGE_CHARS = 6000

export function stripQuotesAndSignature(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (QUOTE_STARTS.some(r => r.test(line))) break
    if (HEADER_FROM.test(line) && lines.slice(i + 1, i + 5).some(l => HEADER_NEXT.test(l.trim()))) break
    if (SIGNATURE_STARTS.some(r => r.test(line))) break
    if (line.startsWith('>')) continue
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
