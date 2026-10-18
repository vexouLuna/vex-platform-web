// The raw shapes chat comes in. Each one is the union of what the archive (Twitch's replay, GQL-shaped) and
// doomtp-bot (EventSub-shaped) send, so the same parsing serves both.

/** A 7TV / BTTV / FFZ emote as its API (or a saved copy of it) gives it. */
export interface RawThirdPartyEmote {
  id: string | number
  /** 7TV and FFZ. */
  name?: string
  /** BTTV. */
  code?: string
  /** 7TV v2 / v3 flags (bit 0, or bit 8 of `data.flags`: zero-width). */
  flags?: number
  data?: { flags?: number } | null
}

export interface RawBadgeVersion {
  id: string
  image_url_1x: string
  image_url_2x: string
  image_url_4x: string
  title?: string
}

export interface RawBadgeSet {
  set_id: string
  versions: RawBadgeVersion[]
}

/** Badge images, as Helix gives them: the channel's sets and the global ones. */
export interface RawBadges {
  channel?: RawBadgeSet[] | null
  global?: RawBadgeSet[] | null
}

/**
 * A piece of a message. Native Twitch emotes come as `emote.emoteID` (replay), `emoticon.emoticon_id` (older replay),
 * `emote_id` or `emote.id` (EventSub, doomtp-bot). A replay's `emote.id` is `<id>;<start>;<end>`.
 */
export interface RawFragment {
  text: string
  type?: string
  emote_id?: string | null
  emote?: { emoteID?: string; id?: string } | null
  emoticon?: { emoticon_id?: string } | null
  /** A GIPHY GIF (`type: 'gif'`): its id, and the archive adds `still` and `title`. Only the id is used. */
  gif?: { id?: string | null; url?: string | null; still?: string | null; title?: string | null } | null
}

/** A chatter's badge: `{_id | setID, version}` (replay) or `{set_id, id}` (EventSub, doomtp-bot). */
export interface RawUserBadge {
  _id?: string
  setID?: string
  set_id?: string
  version?: string
  id?: string
}
