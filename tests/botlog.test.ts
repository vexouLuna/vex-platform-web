import { describe, expect, it, vi } from 'vitest'
import prod from './fixtures/log-chat-types.json'
import { EmoteSet, loadBadges, loadChannelEmotes, pairRedemptions, toChatLine, tokenize, type LogEntry, type LogMessage, type LogModeration, type LogNotification, type Token } from '../src/chat'

const plain = (tokens: Token[]) => tokens.map((t) => (t.kind === 'text' ? t.text : t.kind === 'gif' ? `<${t.title}>` : `[${t.emote.code}]`)).join('')
const user = { id: '1', login: 'someone', display_name: 'SomeOne' }

const message = (extra: Partial<LogMessage> = {}): LogMessage => ({
  kind: 'message',
  id: 'm1',
  at: '2026-09-30T18:00:00Z',
  user,
  text: 'hi Kappa catJAM',
  fragments: [{ text: 'hi ' }, { text: 'Kappa', emote: { id: '25' } }, { text: ' catJAM' }],
  badges: [{ set_id: 'moderator', id: '1', info: '' }],
  color: '#FF0000',
  bits: 0,
  message_type: 'text',
  reply_parent_id: null,
  reply_parent_user: null,
  reward_id: null,
  source_channel_id: null,
  is_self: false,
  is_command: false,
  source: 'eventsub',
  received_at: null,
  deleted_at: null,
  cleared_at: null,
  run: null,
  ...extra,
})

describe('toChatLine', () => {
  const emotes = new EmoteSet().add('7tv', [{ id: 'sev', name: 'catJAM' }])
  const badges = { global: [{ set_id: 'moderator', versions: [{ id: '1', image_url_1x: 'm1', image_url_2x: 'm2', image_url_4x: 'm4', title: 'Moderator' }] }] }

  it('reads a message: emotes (native and third-party), badges, colour, /me, removal', () => {
    const line = toChatLine(message(), emotes, badges)
    expect(plain(line.tokens)).toBe('hi [Kappa] [catJAM]')
    expect([line.kind, line.user, line.login, line.color, line.badges.map((b) => b.title)]).toEqual(['message', 'SomeOne', 'someone', '#FF0000', ['Moderator']])
    expect(line.userId).toBe('1')
    expect(toChatLine(message({ user: null })).userId).toBeNull()
    expect(toChatLine(message({ message_type: 'action', bits: 50 })).action).toBe(true)
    expect(toChatLine(message({ deleted_at: '2026-09-30T18:01:00Z' })).removed?.type).toBe('delete')
    expect(toChatLine(message({ reward_id: 'r1' })).reward?.title).toBe('Reward')
  })

  it('reads notifications as notices: the system message, then what they said', () => {
    const n: LogNotification = {
      kind: 'notification',
      id: 'n1',
      at: '2026-09-30T18:00:00Z',
      user,
      type: 'redemption',
      payload: { system_message: 'SomeOne redeemed Hydrate', text: 'drink catJAM', reward: { title: 'Hydrate', cost: 500 } },
      source: 'eventsub',
    }
    const line = toChatLine(n, emotes)
    expect([line.kind, line.noticeType, plain(line.tokens)]).toEqual(['notice', 'redemption', 'SomeOne redeemed Hydrate — drink [catJAM]'])
    expect(line.reward).toEqual({ title: 'Hydrate', cost: 500, input: 'drink catJAM' })
    expect(plain(toChatLine({ ...n, type: 'raid', payload: {} }).tokens)).toBe('raid')
  })

  it('reads moderation as a notice line', () => {
    const m: LogModeration = {
      kind: 'moderation',
      id: 7,
      at: '2026-09-30T18:00:00Z',
      type: 'timeout',
      message_id: null,
      target: { id: '2', login: 'spammer' },
      moderator: { id: '3', login: 'mod', display_name: 'Mod' },
      duration_s: 600,
      reason: 'spam',
      source: 'eventsub',
    }
    const line = toChatLine(m)
    expect([line.id, line.noticeType, plain(line.tokens)]).toEqual(['mod-7', 'moderation.timeout', 'Mod timed out spammer for 600s: spam'])
  })
})

describe('chat types as prod logged them', () => {
  const entries = prod.entries as LogEntry[]
  const byId = (prefix: string) => toChatLine(entries.find((e) => String(e.id).startsWith(prefix))!)

  it('marks highlighted and gigantified messages with their type', () => {
    expect(byId('f0898650').messageType).toBe('channel_points_highlighted')
    const giant = byId('14f4d3ee')
    expect([giant.messageType, plain(giant.tokens)]).toEqual(['power_ups_gigantified_emote', '[mathilGoose]'])
    expect(toChatLine(message()).messageType).toBeNull()
  })

  it('reads a GIF as a GIPHY image, whatever URL the fragment names', () => {
    const [gif] = byId('0ce2b7e5').tokens
    expect(gif).toEqual({
      kind: 'gif',
      id: 'BsMaPK6JhnO89D3b6i',
      src: 'https://media.giphy.com/media/BsMaPK6JhnO89D3b6i/giphy.gif',
      still: 'https://media.giphy.com/media/BsMaPK6JhnO89D3b6i/giphy_s.gif',
      title: 'Happy Lets Go GIF by TheJoeCoin',
    })
    const elsewhere = { type: 'gif', text: '[x]', gif: { url: 'https://evil.example/media/abc/giphy.gif' } }
    expect(toChatLine(message({ fragments: [elsewhere] })).tokens).toEqual([{ kind: 'text', text: '[x]' }])
    const bad = { type: 'gif', text: '[x]', gif: { id: '../x' } }
    expect(toChatLine(message({ fragments: [bad] })).tokens[0]!.kind).toBe('text')
    // The archive's replay-shaped fragment has no `type`, only the gif.
    expect(tokenize([{ text: '[Hi]', gif: { id: 'BsMaPK6JhnO89D3b6i' } }])[0]).toMatchObject({ kind: 'gif', title: 'Hi' })
  })

  it("shows a sub notice's message as a chat line under its system line", () => {
    const resub = byId('19b8ea67')
    expect(resub.system).toBe("synthetiquee subscribed with Prime. They've subscribed for 3 months!")
    expect([resub.kind, resub.user, resub.login, resub.color, plain(resub.tokens)]).toEqual(['notice', 'synthetiquee', 'synthetiquee', '#FF69B4', '[:)]'])
    expect(plain(byId('ebbdefd0').tokens)).toContain('[moon2CUTE]')
    expect(byId('e7521f39').system).toBeTruthy() // a modiversary with a message
  })

  it('keeps a notice with nothing said as one line', () => {
    for (const id of ['3d211a20', '5a0468a1', '0c4cec2d']) {
      const line = byId(id)
      expect([line.system, line.tokens.length]).toEqual([null, 1])
    }
    expect(plain(byId('3d211a20').tokens)).toBe('SClENTlST subscribed with Prime.')
  })

  it('folds a redemption into the message sent with it', () => {
    const notice = entries.find((e) => e.kind === 'notification' && e.type === 'redemption') as LogNotification
    // Prod had no reward with text input in the sample: this message is the one Twitch sends with such a reward.
    const sent = message({ id: 'm-r', at: '2026-10-11T20:00:03Z', user: notice.user, reward_id: '908a4677-6ea1-488c-b98c-d9cbaf47e55a' })
    const redeemed = { ...notice, at: '2026-10-11T20:00:01Z' }
    const later = { ...sent, id: 'm-late', at: '2026-10-11T20:01:00Z' }
    const out = pairRedemptions([redeemed, sent, later])
    expect(out.map((e) => e.id)).toEqual(['m-r', 'm-late'])
    expect(toChatLine(out[0]!).reward).toEqual({ title: 'laugh', cost: 1, input: null })
    expect(toChatLine(out[1]!).reward?.title).toBe('Reward')
    expect(pairRedemptions([notice])).toEqual([notice]) // no message: the notice stays
  })
})

describe('loadChannelEmotes', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('loads every provider, channel sets before globals, and skips one that fails', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('7tv.io/v3/users')) return ok({ emote_set: { emotes: [{ id: 's1', name: 'Same' }] } })
      if (url.includes('7tv.io/v3/emote-sets/global')) return ok({ emotes: [{ id: 's2', name: 'Global7' }] })
      if (url.includes('betterttv.net/3/cached/users')) return ok({ channelEmotes: [{ id: 'b1', code: 'Same' }], sharedEmotes: [] })
      if (url.includes('betterttv.net/3/cached/emotes/global')) return ok([{ id: 'b2', code: 'GlobalB' }])
      return new Response('down', { status: 503 })
    })
    const set = await loadChannelEmotes('41234567', { fetch })
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(set.find('Same')?.provider).toBe('7tv')
    expect(set.find('GlobalB')?.provider).toBe('bttv')
    expect(set.find('Global7')?.provider).toBe('7tv')
  })

  it('rethrows an abort', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const fetch = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(loadChannelEmotes('1', { fetch, signal: ctrl.signal })).rejects.toThrow()
  })
})

describe('loadBadges', () => {
  it("reads the backend's badges, and gives null when it fails", async () => {
    const badges = { channel: [{ set_id: 'subscriber', versions: [{ id: '0', image_url_1x: 'a', image_url_2x: 'b', image_url_4x: 'c' }] }], global: [] }
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(badges), { status: 200 }))
    expect(await loadBadges('/api/v2/channels/doomtp/badges', { fetch })).toEqual(badges)
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/channels/doomtp/badges')
    expect(await loadBadges('/x', { fetch: vi.fn(async () => new Response('', { status: 503 })) })).toBeNull()
  })
})
