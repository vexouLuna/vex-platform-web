<script setup lang="ts">
import { EmoteSet, pairRedemptions, toChatLine, type LogEntry, type LogMessage, type LogModeration } from '../src/chat'
import prod from '../tests/fixtures/log-chat-types.json'
import { ChatLine } from '../src/vue'
import UserCardDemo from './UserCardDemo.vue'

const emotes = new EmoteSet().add('bttv', [{ id: '5f1b0186cf6d2144653d2970', code: 'catJAM' }])
const user = { id: '1', login: 'someone', display_name: 'SomeOne' }
const base = {
  kind: 'message', at: '2026-09-30T18:00:00Z', user, badges: [], color: '#1E90FF', bits: 0, message_type: 'text',
  reply_parent_id: null, reply_parent_user: null, reward_id: null, source_channel_id: null, is_self: false,
  is_command: false, source: 'eventsub', received_at: null, deleted_at: null, cleared_at: null, run: null,
} as const
const msg = (id: string, text: string, extra: Partial<LogMessage> = {}): LogMessage =>
  ({ ...base, id, text, fragments: [{ text }], ...extra }) as LogMessage
const timeout: LogModeration = {
  kind: 'moderation', id: 1, at: '2026-09-30T18:02:00Z', type: 'timeout', message_id: null,
  target: { id: '2', login: 'spammer' }, moderator: { id: '3', login: 'mod', display_name: 'Mod' },
  duration_s: 600, reason: 'spam', source: 'eventsub',
}
const lines = [
  msg('a', 'hello Kappa catJAM', { fragments: [{ text: 'hello ' }, { text: 'Kappa', emote: { id: '25' } }, { text: ' catJAM' }] }),
  msg('b', 'waves', { message_type: 'action', user: { id: '4', login: 'dimname', display_name: 'dimname' }, color: '#000080' }),
  msg('c', 'this was removed', { deleted_at: '2026-09-30T18:01:00Z' }),
  timeout,
].map((raw) => toChatLine(raw, emotes))
// Real entries from prod (tests/fixtures/log-chat-types.json): highlighted, gigantified, a GIF, sub notices, a redemption.
const types = pairRedemptions(prod.entries as LogEntry[]).map((e) => toChatLine(e))
</script>

<template>
  <Story title="Chat line" :layout="{ type: 'single', iframe: true }">
    <Variant title="Lines">
      <div class="vxp story-frame chat">
        <ChatLine v-for="l in lines" :key="l.id" :line="l">
          <template #before><span class="vxp-mono vxp-muted" style="margin-right: 0.5ch">18:00</span></template>
        </ChatLine>
      </div>
    </Variant>
    <Variant title="Message and notice types">
      <div class="vxp story-frame chat">
        <ChatLine v-for="l in types" :key="l.id" :line="l" />
      </div>
    </Variant>
    <Variant title="User cards">
      <div class="vxp story-frame chat">
        <p class="vxp-muted vxp-small">Click a name. SomeOne has a profile; dimname has none.</p>
        <UserCardDemo :lines="lines" />
      </div>
    </Variant>
    <Variant title="Raw colours, login names">
      <div class="vxp story-frame chat">
        <ChatLine v-for="l in lines" :key="l.id" :line="l" colors="raw" names="both" :badges="false" />
      </div>
    </Variant>
  </Story>
</template>
