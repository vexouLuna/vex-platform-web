// doomtp-bot's v2 chat log (`GET /api/v2/channels/{login}/log`) and its entries as chat lines.
import type { EmoteSet } from './emotes'
import { resolveBadges, tokenize, type ChatLine, type Removal, type Token } from './message'
import type { RawBadges, RawFragment, RawUserBadge } from './types'

export interface LogUser {
  id: string
  login: string | null
  display_name?: string | null
}

export interface LogCommandRun {
  ref: string | null
  trigger_type: string | null
  trigger_id: string | null
  expr: string | null
  code: unknown
  message: string | null
}

export interface LogMessage {
  kind: 'message'
  id: string
  /** ISO 8601. */
  at: string
  user: LogUser | null
  text: string
  fragments: (RawFragment & { mention?: { id: string; login: string } | null; cheermote?: unknown })[]
  badges: (RawUserBadge & { info?: string })[]
  color: string | null
  bits: number
  message_type: string
  reply_parent_id: string | null
  reply_parent_user: LogUser | null
  reward_id: string | null
  source_channel_id: string | null
  is_self: boolean
  is_command: boolean
  source: string
  received_at: string | null
  deleted_at: string | null
  cleared_at: string | null
  run: LogCommandRun | null
  /** Not from the API: the reward's title and cost, which `pairRedemptions` takes from the redemption's notice. */
  reward?: { title?: string; cost?: number | null } | null
}

export interface LogNotification {
  kind: 'notification'
  id: string
  at: string
  user: LogUser | null
  /** `sub`, `resub`, `raid`, `follow`, `redemption`, `cheer`, `announcement`… */
  type: string
  /** Depends on `type`; every type has `system_message` and `text`. */
  payload: {
    system_message?: string
    text?: string
    reward?: { title?: string; cost?: number | null }
    bits?: number
    [k: string]: unknown
  }
  /** The user's own message (a resub's), with their badges and colour. Bots before 0.x leave them out. */
  fragments?: LogMessage['fragments']
  badges?: LogMessage['badges']
  color?: string | null
  source: string
}

export interface LogModeration {
  kind: 'moderation'
  id: number
  at: string
  /** `ban`, `timeout`, `delete`, `clear`… */
  type: string
  message_id: string | null
  target: LogUser | null
  moderator: LogUser | null
  duration_s: number | null
  reason: string | null
  source: string
}

export type LogEntry = LogMessage | LogNotification | LogModeration

export interface LogSession {
  started_at: string
  ended_at: string | null
  end_reason: string | null
}

export interface LogGap {
  start: string
  end: string
  reason: 'before_log' | 'between_sessions' | 'not_listening'
  backfill: {
    complete: boolean
    inserted: number | null
    error: string | null
    provider: string | null
    /** The job run that filled it, when it was a job (bots from before 0.8 leave it out). */
    job_id?: number | null
  } | null
}

export interface LogCoverage {
  since: string
  until: string
  sessions: LogSession[]
  gaps: LogGap[]
  /** Whether the log has every message of the window Twitch let it see. */
  complete: boolean
}

export interface LogQuery {
  /** Inclusive, ISO 8601. */
  since?: string
  /** Exclusive, ISO 8601. */
  until?: string
  order?: 'asc' | 'desc'
  kind?: LogEntry['kind'][]
  /** A login, old ones too. */
  user?: string
  q?: string
  hide_removed?: boolean
  cursor?: string
  limit?: number
}

const nameOf = (u: LogUser | null | undefined) => u?.display_name || u?.login || u?.id || 'someone'
const text = (t: string): Token[] => (t ? [{ kind: 'text', text: t }] : [])

function removal(m: LogMessage): Removal | null {
  if (m.deleted_at) return { type: 'delete', reason: null, seconds: null }
  if (m.cleared_at) return { type: 'user_clear', reason: null, seconds: null }
  return null
}

const MODERATION: Record<string, string> = {
  ban: 'banned',
  unban: 'unbanned',
  timeout: 'timed out',
  untimeout: 'lifted the timeout on',
  delete: 'deleted a message from',
}

/** A v2 log entry as a chat line: messages as messages, notifications and moderation as notices. */
export function toChatLine(e: LogEntry, emotes?: EmoteSet | null, badges?: RawBadges | null): ChatLine {
  const base = { badges: [], action: false, bits: null, reward: null, removed: null }
  if (e.kind === 'message') {
    return {
      ...base,
      id: e.id,
      user: nameOf(e.user),
      login: e.user?.login ?? null,
      userId: e.user?.id ?? null,
      color: e.color,
      badges: resolveBadges(e.badges, badges),
      tokens: tokenize(e.fragments, emotes),
      kind: 'message',
      noticeType: null,
      messageType: e.message_type === 'text' || e.message_type === 'action' ? null : e.message_type,
      action: e.message_type === 'action',
      bits: e.bits || null,
      // The log has the reward's id only; its title comes with the redemption notice (`pairRedemptions`).
      reward: e.reward_id ? { title: e.reward?.title || 'Reward', cost: e.reward?.cost ?? null, input: null } : null,
      removed: removal(e),
    }
  }
  if (e.kind === 'notification') {
    const p = e.payload
    const said = tokenize(e.fragments?.length ? e.fragments : p.text ? [{ text: p.text }] : [], emotes)
    const system = p.system_message || e.type
    // A notice with something said shows as its system line over a normal chat line; a redemption keeps its input
    // inline, as the reward's text.
    const chat = said.length > 0 && e.type !== 'redemption'
    return {
      ...base,
      id: e.id,
      user: nameOf(e.user),
      login: e.user?.login ?? null,
      userId: e.user?.id ?? null,
      color: e.color ?? null,
      badges: resolveBadges(e.badges, badges),
      tokens: chat ? said : [...text(system), ...(said.length ? [...text(' — '), ...said] : [])],
      system: chat ? system : null,
      kind: 'notice',
      noticeType: e.type,
      bits: p.bits || null,
      reward: p.reward?.title ? { title: p.reward.title, cost: p.reward.cost ?? null, input: p.text || null } : null,
    }
  }
  const what = MODERATION[e.type] ?? e.type
  const span = e.duration_s ? ` for ${e.duration_s}s` : ''
  return {
    ...base,
    id: `mod-${e.id}`,
    user: nameOf(e.moderator),
    login: e.moderator?.login ?? null,
    color: null,
    tokens: text(`${nameOf(e.moderator)} ${what} ${nameOf(e.target)}${span}${e.reason ? `: ${e.reason}` : ''}`),
    kind: 'notice',
    noticeType: `moderation.${e.type}`,
  }
}

/** How far apart a redemption's notice and the chat message sent with it can be, in ms. */
const REDEMPTION_MATCH_MS = 10_000

/**
 * A reward with text input shows up twice in the log: the redemption's notice and the chat message sent with it. This
 * drops each notice that has its message (same user and reward, within 10s) and gives the message the reward's title
 * and cost. Other entries pass through as they are, in their order.
 */
export function pairRedemptions<T extends LogEntry>(entries: readonly T[]): T[] {
  const rewardOf = (n: LogNotification) => (n.payload.reward as { id?: string } | undefined)?.id
  const notices = entries.filter((e): e is T & LogNotification => e.kind === 'notification' && e.type === 'redemption')
  const paired = new Map<T, LogNotification>() // message → its notice
  const used = new Set<T>()
  for (const m of entries) {
    if (m.kind !== 'message' || !m.reward_id) continue
    const n = notices.find((n) => !used.has(n) && rewardOf(n) === m.reward_id && n.user?.id === m.user?.id
      && Math.abs(Date.parse(n.at) - Date.parse(m.at)) <= REDEMPTION_MATCH_MS)
    if (n) {
      used.add(n)
      paired.set(m, n)
    }
  }
  return entries.filter((e) => !used.has(e)).map((e) => {
    const n = paired.get(e)
    return n ? { ...e, reward: n.payload.reward } : e
  })
}
