<script setup lang="ts">
// One chat line as Twitch shows it: reward, badges, the coloured name, bits, then the text with its emotes and GIFs.
// Notices (subs, raids, redemptions, moderation) are the text alone, set off; one with the user's own message (a resub's)
// is its system line over a normal chat line. Highlighted, intro and effect messages are set off too, and a gigantified
// emote is drawn large. Removed messages are struck through with why. A GIF that won't load, or any with `gifs` off,
// shows its text.
// The `before` slot goes first on the line (a timestamp), the `after` slot last. With `userCards`, the name is a button
// asking for the chatter's card (`UserCard`).
import { ref } from 'vue'
import { twitchColor } from '../../chat/color'
import { chatName, removalNote, type ChatLine, type EmoteToken, type GifToken, type NameMode } from '../../chat/message'
import ChatEmote from './ChatEmote.vue'

const props = withDefaults(
  defineProps<{
    line: ChatLine
    badges?: boolean
    /** `readable` lifts dark name colours so they show on a dark background; `raw` keeps the chatter's own. */
    colors?: 'readable' | 'raw'
    names?: NameMode
    /** Emote providers shown as images (missing ones are on). */
    emotes?: Partial<Record<'7tv' | 'bttv' | 'ffz', boolean>>
    /** GIPHY GIFs as images; off shows their text (`[Cat GIF by ViralHog]`) and loads nothing from giphy.com. */
    gifs?: boolean
    /** The emote whose menu is open, for its `aria-expanded`. */
    openToken?: EmoteToken | null
    /** Make the name a button that emits `user`. */
    userCards?: boolean
    /** This line's user card is open, for the name's `aria-expanded`. */
    userOpen?: boolean
  }>(),
  { badges: true, colors: 'readable', names: 'display', emotes: () => ({}), gifs: true, openToken: null, userCards: false, userOpen: false },
)
const emit = defineEmits<{ emoteMenu: [token: EmoteToken, anchor: HTMLElement]; user: [line: ChatLine, anchor: HTMLElement] }>()

const color = () => twitchColor(props.line.user, props.line.color, props.colors)
const name = () => chatName(props.line.user, props.line.login, props.names)
// Twitch draws the last emote of a gigantified message large.
const giant = () => (props.line.messageType === 'power_ups_gigantified_emote' ? props.line.tokens.findLastIndex((t) => t.kind === 'emote') : -1)
// GIFs that didn't load (gone from GIPHY, blocked) show their text instead.
const failed = ref<GifToken[]>([])
const big = (t: EmoteToken): EmoteToken => ({ ...t, image: { ...t.image, src: t.image.large, srcset: t.image.large } })
</script>

<template>
  <div
    class="vxp-chat-line"
    :class="{ notice: line.kind === 'notice', said: !!line.system, removed: line.removed }"
    :data-notice="line.noticeType ?? undefined"
    :data-type="line.messageType ?? undefined"
  >
    <slot name="before" />
    <span v-if="line.system" class="system">{{ line.system }}</span>
    <template v-if="line.kind === 'message' || line.system">
      <span v-if="line.reward" class="tag"
        >{{ line.reward.title }}<template v-if="line.reward.cost"> · {{ line.reward.cost }}</template></span
      >
      <span v-if="badges && line.badges.length" class="badges">
        <img v-for="b in line.badges" :key="b.setId" :src="b.src" :srcset="b.srcset" :alt="b.title" :title="b.title" width="18" height="18" loading="lazy" />
      </span>
      <component
        :is="userCards ? 'button' : 'span'"
        class="who"
        :class="{ me: line.action, btn: userCards }"
        :style="{ color: color() }"
        v-bind="userCards ? { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': userOpen } : {}"
        @click="userCards && emit('user', line, $event.currentTarget as HTMLElement)"
        >{{ name().name }}<span v-if="name().login" class="login"> ({{ name().login }})</span></component
      >
      <span v-if="line.bits" class="tag mono">{{ line.bits }} bits</span>
    </template>
    <span class="text" :class="{ me: line.action }" :style="line.action ? { color: color() } : undefined">
      <template v-for="(t, j) in line.tokens" :key="j">
        <span v-if="t.kind === 'emote' && j === giant()" class="giant"
          ><ChatEmote :token="big(t)" :enabled="emotes" :open="openToken === t" @menu="emit('emoteMenu', t, $event)"
        /></span>
        <ChatEmote v-else-if="t.kind === 'emote'" :token="t" :enabled="emotes" :open="openToken === t" @menu="emit('emoteMenu', t, $event)" />
        <picture v-else-if="t.kind === 'gif' && gifs && !failed.includes(t)" class="gif">
          <source media="(prefers-reduced-motion: reduce)" :srcset="t.still" />
          <img :src="t.src" :alt="t.title" :title="t.title" loading="lazy" @error="failed.push(t)" />
        </picture>
        <span v-else-if="t.kind === 'gif'">[{{ t.title }}]</span>
        <span v-else>{{ t.text }}</span>
      </template>
    </span>
    <span v-if="line.removed" class="why">{{ removalNote(line.removed) }}</span>
    <slot name="after" />
  </div>
</template>

<style scoped>
.vxp-chat-line { color: var(--vxp-chat-ink); overflow-wrap: anywhere; }
.badges { display: inline-flex; gap: 2px; vertical-align: -3px; margin-right: 4px; }
.badges img { width: 18px; height: 18px; }
.who { font-weight: 700; }
.who::after { content: ':'; color: var(--vxp-chat-muted); margin-right: 5px; }
.who.me::after { content: ''; margin-right: 5px; }
.who.btn { padding: 0; font: inherit; font-weight: 700; background: none; border: 0; border-radius: 3px; cursor: pointer; }
.who.btn:hover { text-decoration: underline; }
.who.btn:focus-visible { outline: 2px solid var(--vxp-ring); outline-offset: 1px; }
.login { font-weight: 400; color: var(--vxp-chat-muted); }
.text.me { font-style: italic; }
.tag {
  display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; font-size: 0.85em; line-height: 1.5;
  background: color-mix(in srgb, var(--vxp-accent) 18%, transparent); color: var(--vxp-chat-ink);
}
.mono { font-family: var(--vxp-mono); }
.notice {
  padding: 2px 8px; border-left: 2px solid var(--vxp-accent); background: color-mix(in srgb, var(--vxp-accent) 8%, transparent);
  color: var(--vxp-chat-muted);
}
.system { display: block; }
.said .text { color: var(--vxp-chat-ink); }
[data-type='channel_points_highlighted'], [data-type='user_intro'], [data-type='power_ups_message_effect'] {
  padding: 2px 8px; border-radius: 4px; background: color-mix(in srgb, var(--vxp-accent) 22%, transparent);
}
[data-type='user_intro'] { border-left: 2px solid var(--vxp-accent); }
.giant { display: inline-block; margin: 6px 0; }
.giant :deep(.img), .giant :deep(.ghost) { height: 112px; }
.gif { display: block; margin: 2px 0; }
.gif img { max-width: 100%; max-height: 160px; border-radius: 4px; }
.removed .text { text-decoration: line-through; opacity: 0.55; }
.why { margin-left: 6px; font-size: 11px; font-style: italic; color: var(--vxp-chat-muted); }
</style>
