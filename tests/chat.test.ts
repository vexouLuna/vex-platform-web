import { describe, expect, it } from 'vitest'
import { EmoteSet, emoteImage, emotePage, resolveBadges, tokenize } from '../src/chat'

describe('messages', () => {
  const emotes = new EmoteSet()
    .add('7tv', [{ id: 'sev', name: 'catJAM' }])
    .add('ffz', [{ id: 42, name: 'monkaS' }])
    .add('bttv', [{ id: 'bt', code: 'catJAM' }, { id: 'bt2', code: 'Clap' }])

  it('looks emotes up 7TV → FFZ → BTTV and keeps whitespace', () => {
    const tokens = tokenize([{ text: 'hi catJAM  monkaS Clap!' }], emotes)
    expect(tokens.map((t) => (t.kind === 'text' ? t.text : t.kind === 'gif' ? `<${t.id}>` : `[${t.emote.provider}:${t.emote.code}]`))).toEqual([
      'hi ',
      '[7tv:catJAM]',
      '  ',
      '[ffz:monkaS]',
      ' Clap!',
    ])
  })

  it('uses native Twitch emote fragments in both historical shapes', () => {
    const tokens = tokenize([{ text: 'Kappa', emote: { emoteID: '25' } }, { text: ' ' }, { text: 'PogChamp', emoticon: { emoticon_id: '88' } }])
    expect(tokens.filter((t) => t.kind === 'emote').map((t) => t.kind === 'emote' && t.emote.id)).toEqual(['25', '88'])
    expect(tokens[0]!.kind === 'emote' && tokens[0]!.image.src).toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0')
  })

  it("takes a replay emote's id without its offsets", () => {
    const ids = (f: Parameters<typeof tokenize>[0]) => tokenize(f).flatMap((t) => (t.kind === 'emote' ? [t.emote.id] : []))
    expect(ids([{ text: 'vexoulHELP', emote: { emoteID: 'emotesv2_1a6', id: 'emotesv2_1a6;5;14' } }])).toEqual(['emotesv2_1a6'])
    expect(ids([{ text: ':)', emote: { id: '555555628;36;37' } }])).toEqual(['555555628'])
  })

  describe('zero-width emotes and modifiers', () => {
    const set = new EmoteSet()
      .add('7tv', [
        { id: 'pc', code: 'POGCRAZY', flags: 0 },
        { id: 'pp', code: 'PETPET', flags: 1 },
        { id: 'rt', name: 'RainTime', flags: 0, data: { flags: 256 } },
      ])
      .add('ffz', [
        { id: 1, code: 'OMEGALUL' },
        { id: 2, code: 'ffzW' },
        { id: 3, code: 'ffzX' },
      ])
      .add('bttv', [
        { id: 'b1', code: 'KKona' },
        { id: 'bw', code: 'w!' },
        { id: 'bh', code: 'h!' },
        { id: 'bz', code: 'z!' },
        { id: 'bm', code: 'cvMask' },
      ])
    // [base(+mods) / overlay(+mods)], text as is.
    const show = (text: string) =>
      tokenize([{ text }], set).map((t) => {
        if (t.kind === 'text') return t.text
        if (t.kind === 'gif') return `<${t.id}>`
        const l = (x: { emote: { code: string }; modifiers: { code: string }[] }) => [x.emote.code, ...x.modifiers.map((m) => m.code)].join('+')
        return `[${[t, ...t.overlays].map(l).join(' / ')}]`
      })

    it('flags 7TV zero-width emotes from the set entry or the emote data, and BTTV overlays by name', () => {
      expect(set.find('PETPET')?.zeroWidth).toBe(true)
      expect(set.find('RainTime')?.zeroWidth).toBe(true)
      expect(set.find('cvMask')?.zeroWidth).toBe(true)
      expect(set.find('POGCRAZY')?.zeroWidth).toBeUndefined()
    })

    it('lays zero-width emotes over the emote before, dropping the gap', () => {
      expect(show('POGCRAZY PETPET')).toEqual(['[POGCRAZY / PETPET]'])
      expect(show('hi KKona PETPET RainTime cvMask !')).toEqual(['hi ', '[KKona / PETPET / RainTime / cvMask]', ' !'])
    })

    it('lays them over native Twitch emotes too', () => {
      const tokens = tokenize([{ text: 'Kappa', emote: { emoteID: '25' } }, { text: ' PETPET' }], set)
      expect(tokens).toHaveLength(1)
      const [t] = tokens
      expect(t?.kind === 'emote' && [t.emote.provider, t.overlays[0]?.emote.code]).toEqual(['twitch', 'PETPET'])
    })

    it('keeps a zero-width emote with nothing to cover as an ordinary emote', () => {
      expect(show('PETPET')).toEqual(['[PETPET]'])
      expect(show('ongang PETPET')).toEqual(['ongang ', '[PETPET]'])
    })

    it('applies BTTV modifiers to the emote after them', () => {
      expect(show('w! h! OMEGALUL wow')).toEqual(['[OMEGALUL+w!+h!]', ' wow'])
      expect(tokenize([{ text: 'w! KKona' }], set)[0]).toMatchObject({ modifiers: [{ effect: 'wide', code: 'w!', provider: 'bttv', id: 'bw' }] })
    })

    it('makes BTTV z! lay the next emote over the one before', () => {
      expect(show('KKona z! OMEGALUL')).toEqual(['[KKona / OMEGALUL+z!]'])
    })

    it('applies FFZ modifiers to the emote before them', () => {
      expect(show('KKona ffzW ffzX')).toEqual(['[KKona+ffzW+ffzX]'])
      expect(show('POGCRAZY PETPET ffzX')).toEqual(['[POGCRAZY+ffzX / PETPET]'])
    })

    it('keeps modifiers with nothing to modify as ordinary emotes, whitespace intact', () => {
      expect(show('w!  hello')).toEqual(['[w!]', '  hello'])
      expect(show('ffzW KKona')).toEqual(['[ffzW]', ' ', '[KKona]'])
      expect(show('KKona w!')).toEqual(['[KKona]', ' ', '[w!]'])
    })
  })

  it('never produces markup', () => {
    const tokens = tokenize([{ text: '<img src=x onerror=alert(1)>' }], emotes)
    expect(tokens).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  })

  it('builds emote image URLs per provider', () => {
    expect(emoteImage({ provider: 'ffz', id: '42' }).large).toBe('https://cdn.frankerfacez.com/emote/42/4')
    expect(emoteImage({ provider: '7tv', id: 'sev' }).src).toBe('https://cdn.7tv.app/emote/sev/1x.webp')
    expect(emoteImage({ provider: 'bttv', id: 'bt' }).src).toBe('https://cdn.betterttv.net/emote/bt/1x')
  })

  it('links emotes to their provider pages', () => {
    expect(emotePage({ provider: '7tv', id: 'sev' })).toBe('https://7tv.app/emotes/sev')
    expect(emotePage({ provider: 'bttv', id: 'bt' })).toBe('https://betterttv.com/emotes/bt')
    expect(emotePage({ provider: 'ffz', id: '42' })).toBe('https://www.frankerfacez.com/emoticon/42')
    expect(emotePage({ provider: 'twitch', id: 'emotesv2_x' })).toBeNull()
  })

  it('only uses the providers own CDNs', () => {
    for (const provider of ['twitch', 'ffz', 'bttv', '7tv'] as const) {
      const { src } = emoteImage({ provider, id: 'x' })
      expect(new URL(src).hostname).toMatch(/(^|\.)(jtvnw\.net|frankerfacez\.com|betterttv\.net|7tv\.app)$/)
    }
  })

  it('resolves badges from the channel set before the global one, skipping empty ones', () => {
    const badges = {
      channel: [{ set_id: 'subscriber', versions: [{ id: '12', image_url_1x: 'c1', image_url_2x: 'c2', image_url_4x: 'c4' }] }],
      global: [
        { set_id: 'subscriber', versions: [{ id: '12', image_url_1x: 'g1', image_url_2x: 'g2', image_url_4x: 'g4' }] },
        { set_id: 'moderator', versions: [{ id: '1', image_url_1x: 'm1', image_url_2x: 'm2', image_url_4x: 'm4', title: 'Moderator' }] },
      ],
    }
    const out = resolveBadges([{ setID: 'subscriber', version: '12' }, { setID: '', version: '' }, { _id: 'moderator', version: '1' }], badges)
    expect(out.map((b) => [b.setId, b.src, b.title])).toEqual([
      ['subscriber', 'c1', 'subscriber'],
      ['moderator', 'm1', 'Moderator'],
    ])
  })
})
