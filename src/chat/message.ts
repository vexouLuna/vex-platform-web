// Chat messages → render-ready tokens. No HTML is produced here: sites render the tokens with their own components,
// so message text can never be injected as markup.
import type { RawBadges, RawFragment, RawUserBadge } from './types'
import { emoteImage, modifierOf, type Emote, type EmoteImage, type EmoteSet, type ModifierEffect } from './emotes'

/**
 * A BTTV / FFZ modifier applied to an emote; `code` is what was typed, for showing it as text instead. `id` is the
 * modifier's own emote id, for its image or page.
 */
export interface Modifier {
  effect: ModifierEffect
  code: string
  provider: 'bttv' | 'ffz'
  id: string
}

/** One emote image and the modifiers applied to it. */
export interface EmoteLayer {
  emote: Emote
  image: EmoteImage
  modifiers: Modifier[]
}

/**
 * An emote token is the emote typed, plus the zero-width emotes typed after it (`overlays`, bottom to top), drawn
 * over it. Modifier words are folded into the layer they apply to rather than kept as tokens.
 */
export type EmoteToken = { kind: 'emote'; overlays: EmoteLayer[] } & EmoteLayer

/** A GIPHY GIF sent from Twitch's GIF picker: the animated GIF, its still frame and the text Twitch shows for it. */
export type GifToken = { kind: 'gif'; id: string; src: string; still: string; title: string }

export type Token = { kind: 'text'; text: string } | EmoteToken | GifToken

type Part = { kind: 'space'; text: string } | { kind: 'word'; text: string } | { kind: 'emote'; emote: Emote } | { kind: 'gif'; gif: GifToken }

export interface Badge {
  setId: string
  version: string
  title: string
  src: string
  srcset: string
  large: string
}

/** A moderator's removal of a message (doomtp-bot's chat only). */
export interface Removal {
  /** `delete` (just this message), `timeout`, `ban`, `user_clear` or `chat_clear`. */
  type: string
  reason: string | null
  /** A timeout's length. */
  seconds: number | null
}

/**
 * A chat line ready to render, from whichever source. vods-core's `ChatMessage` adds the VOD time and source to it;
 * `toChatLine` makes one from doomtp-bot's v2 log.
 */
export interface ChatLine {
  id: string
  /** The display name. */
  user: string
  /** The username (login), or null when the source can't tell it. */
  login: string | null
  /** The chatter's Twitch user id, when the source has it (doomtp-bot's chat does; Twitch's VOD replay doesn't). */
  userId?: string | null
  /** The user's chosen colour, or null (render with `twitchColor`, which picks Twitch's default). */
  color: string | null
  badges: Badge[]
  tokens: Token[]
  /**
   * `notice`: a sub, gift, raid, redemption or moderation, with its text in `tokens` and its type in `noticeType`. A
   * notice that carries the user's own message (a resub's) has its system text in `system` and the message in `tokens`,
   * and renders as that line over a normal chat line.
   */
  kind: 'message' | 'notice'
  noticeType: string | null
  system?: string | null
  /**
   * Twitch's message type when it is not plain `text`: `channel_points_highlighted`, `channel_points_sub_only`,
   * `user_intro`, `power_ups_gigantified_emote`, `power_ups_message_effect`.
   */
  messageType?: string | null
  /** A /me message. */
  action: boolean
  bits: number | null
  /** The channel-point reward the message was sent with. */
  reward: { title: string; cost: number | null; input: string | null } | null
  removed: Removal | null
}

/** A removal as one line of text: "Timed out for 600s: spam". */
export function removalNote(r: Removal): string {
  const what =
    r.type === 'timeout' ? `Timed out${r.seconds ? ` for ${r.seconds}s` : ''}`
    : r.type === 'ban' ? 'Banned'
    : r.type === 'delete' ? 'Deleted by a moderator'
    : 'Cleared by a moderator'
  return r.reason ? `${what}: ${r.reason}` : what
}

/** How names show: the display name, the login, or both when they differ by more than case. */
export type NameMode = 'display' | 'login' | 'both'

/** The name to show for a chatter, and the login to show after it in `both` mode (null when it adds nothing). */
export function chatName(user: string, login: string | null, mode: NameMode = 'display'): { name: string; login: string | null } {
  if (mode === 'login') return { name: login ?? user, login: null }
  if (mode === 'both' && login && login !== user.toLowerCase()) return { name: user, login }
  return { name: user, login: null }
}

const GIPHY_ID = /^[A-Za-z0-9]{1,64}$/
const GIPHY_URL = /^https:\/\/media\d*\.giphy\.com\/media\/([A-Za-z0-9]{1,64})\//

/** A `gif` fragment as a token, or null without a GIPHY id. Images only ever come from GIPHY's own CDN. */
function gifOf(f: RawFragment): GifToken | null {
  const given = f.gif?.id ?? f.gif?.url?.match(GIPHY_URL)?.[1]
  if (!given || !GIPHY_ID.test(given)) return null
  const media = `https://media.giphy.com/media/${given}`
  const title = f.text.trim().replace(/^\[(.*)\]$/, '$1').trim() || 'GIF'
  return { kind: 'gif', id: given, src: `${media}/giphy.gif`, still: `${media}/giphy_s.gif`, title }
}

/** Fragments as words, the gaps between them (original whitespace kept), emotes and GIFs. */
function* parts(fragments: readonly RawFragment[], emotes?: EmoteSet | null): Generator<Part> {
  for (const f of fragments) {
    // doomtp-bot's fragments say `type: 'gif'`; the archive's replay-shaped ones only carry the `gif`.
    const gif = f.gif ? gifOf(f) : null
    if (gif) {
      yield { kind: 'gif', gif }
      continue
    }
    // Replay fragments carry both emote.emoteID and emote.id, which is `<id>;<start>;<end>`: the clean one first, and
    // never the offsets.
    const nativeId = f.emote_id ?? f.emote?.emoteID ?? f.emote?.id ?? f.emoticon?.emoticon_id
    if (nativeId) {
      yield { kind: 'emote', emote: { provider: 'twitch', id: String(nativeId).split(';')[0]!, code: f.text.trim() } }
      continue
    }
    for (const text of f.text.split(/(\s+)/)) {
      if (!text) continue
      if (/\s/.test(text)) {
        yield { kind: 'space', text }
        continue
      }
      const emote = emotes?.find(text)
      yield emote ? { kind: 'emote', emote } : { kind: 'word', text }
    }
  }
}

/**
 * Splits fragments into text and emote tokens. Adjacent text is merged.
 *
 * Zero-width emotes (and emotes after BTTV's `z!`) become overlays of the emote before them, dropping the gap between.
 * BTTV modifiers apply to the emote after them, FFZ modifiers to the emote before. A zero-width emote or modifier with
 * no emote to go with stays an ordinary emote.
 */
export function tokenize(fragments: readonly RawFragment[] | null | undefined, emotes?: EmoteSet | null): Token[] {
  const out: Token[] = []
  const pushText = (text: string) => {
    const last = out.at(-1)
    if (last?.kind === 'text') last.text += text
    else out.push({ kind: 'text', text })
  }
  const layer = (emote: Emote, modifiers: Modifier[] = []): EmoteLayer => ({ emote, image: emoteImage(emote), modifiers })
  const pushEmote = (l: EmoteLayer) => out.push({ kind: 'emote', ...l, overlays: [] })
  // The emote right before, dropping the gap between. Null (and nothing dropped) when there is none.
  const previous = (): EmoteToken | null => {
    const last = out.at(-1)
    if (last?.kind === 'emote') return last
    const before = out.at(-2)
    if (last?.kind !== 'text' || before?.kind !== 'emote' || last.text.trim()) return null
    out.pop()
    return before
  }

  // BTTV modifiers seen so far, and what was typed with them, until an emote comes.
  let pending: Modifier[] = []
  let held: Exclude<Part, { kind: 'gif' }>[] = []
  const release = () => {
    for (const p of held) {
      if (p.kind === 'emote') pushEmote(layer(p.emote))
      else pushText(p.text)
    }
    pending = []
    held = []
  }

  for (const part of parts(fragments ?? [], emotes)) {
    if (part.kind === 'gif') {
      release()
      out.push(part.gif)
      continue
    }
    if (part.kind !== 'emote') {
      if (part.kind === 'space' && pending.length) held.push(part)
      else {
        release()
        pushText(part.text)
      }
      continue
    }
    const { emote } = part
    const mod = modifierOf(emote)
    const asModifier: Modifier | null = mod && { effect: mod.effect, code: emote.code, provider: emote.provider as 'bttv' | 'ffz', id: emote.id }
    if (mod?.before) {
      pending.push(asModifier!)
      held.push(part)
      continue
    }
    if (mod && !pending.length) {
      const target = previous()
      if (target) {
        target.modifiers.push(asModifier!)
        continue
      }
    }
    const l = layer(emote, pending)
    pending = []
    held = []
    if (emote.zeroWidth || l.modifiers.some((m) => m.effect === 'zeroSpace')) {
      const target = previous()
      if (target) {
        target.overlays.push(l)
        continue
      }
    }
    pushEmote(l)
  }
  release()
  return out
}

// "set/version" → Badge for a badges payload, channel set first so it wins over global. Built once per payload.
const badgeIndexes = new WeakMap<RawBadges, Map<string, Badge>>()

function badgeIndex(badges: RawBadges): Map<string, Badge> {
  let index = badgeIndexes.get(badges)
  if (index) return index
  index = new Map()
  for (const sets of [badges.channel, badges.global]) {
    for (const set of sets ?? []) {
      for (const v of set.versions) {
        const key = `${set.set_id}/${v.id}`
        if (index.has(key)) continue
        index.set(key, {
          setId: set.set_id,
          version: v.id,
          title: v.title ?? set.set_id,
          src: v.image_url_1x,
          srcset: `${v.image_url_1x} 1x, ${v.image_url_2x} 2x, ${v.image_url_4x} 4x`,
          large: v.image_url_4x,
        })
      }
    }
  }
  badgeIndexes.set(badges, index)
  return index
}

/** Badge images for a comment's badges, channel set first, then global. Unknown badges are skipped. */
export function resolveBadges(userBadges: readonly RawUserBadge[] | null | undefined, badges?: RawBadges | null): Badge[] {
  if (!badges || !userBadges) return []
  const index = badgeIndex(badges)
  const out: Badge[] = []
  for (const b of userBadges) {
    const setId = b._id ?? b.setID ?? b.set_id
    const version = b.version ?? b.id
    const badge = setId && version ? index.get(`${setId}/${version}`) : undefined
    if (badge) out.push(badge)
  }
  return out
}
