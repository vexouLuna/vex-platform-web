<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { safeNext, signInTarget } from '../src'
import { auditFiltersFrom, auditFiltersQuery, jobFiltersFrom, jobFiltersQuery, useAdminSession, type SessionAuth } from '../src/vue'
import bot from '../tests/fixtures/session-bot.json'

// doomtp-bot's session over the fixture: sign in, let a call come back 401, sign out.
type Bot = Omit<typeof bot, 'csrf' | 'user'> & { csrf: string | null; user: { id: string; login: string } | null }
const auth: SessionAuth = reactive({ csrf: null, onUnauthorized: null })
const signedIn = ref(false)
const session = useAdminSession<Bot>({
  auth,
  load: async () => (signedIn.value ? bot : { ...bot, authenticated: false, csrf: null, user: null }),
  logout: async () => (signedIn.value = false),
})
const expired = ref(0)
session.setExpiredHandler(() => expired.value++)
void session.ensure()
const twitch = (next: string) => `/auth/admin/login?${new URLSearchParams({ next })}`
const target = computed(() =>
  signInTarget({ authenticated: session.authenticated.value, twitchLogin: !!session.data.value?.twitch_login, notice: session.notice.value }, '/manage/jobs', twitch),
)
function signIn() {
  signedIn.value = true
  session.signIn(bot)
}

const query = ref('state=failed&kind=upload&actor=%20me%20&next=//evil.example')
const params = computed(() => Object.fromEntries(new URLSearchParams(query.value)))
</script>

<template>
  <Story title="Admin session" :layout="{ type: 'single', iframe: true }">
    <Variant title="Session">
      <div class="vxp story-frame stack">
        <div class="row">
          <button type="button" class="vxp-btn primary" :disabled="session.authenticated.value" @click="signIn">Sign in</button>
          <button type="button" class="vxp-btn" :disabled="!session.authenticated.value" @click="auth.onUnauthorized?.()">A call comes back 401</button>
          <button type="button" class="vxp-btn" :disabled="!session.authenticated.value" @click="session.logout()">Sign out</button>
        </div>
        <dl class="vxp-small">
          <dt>Checked</dt><dd>{{ session.checked.value }}</dd>
          <dt>Signed in</dt><dd>{{ session.authenticated.value }} {{ session.data.value?.user?.login ?? '' }}</dd>
          <dt>CSRF sent</dt><dd class="vxp-mono">{{ auth.csrf ?? '—' }}</dd>
          <dt>Notice</dt><dd>{{ session.notice.value ?? '—' }}</dd>
          <dt>Expired handler ran</dt><dd>{{ expired }}×</dd>
          <dt>A /manage page sends them</dt><dd class="vxp-mono">{{ target ? JSON.stringify(target) : 'through' }}</dd>
        </dl>
      </div>
    </Variant>
    <Variant title="Filters in the query">
      <div class="vxp story-frame stack">
        <label class="vxp-field">Query string<input v-model="query" class="vxp-input vxp-mono" /></label>
        <dl class="vxp-small vxp-mono">
          <dt>jobFiltersFrom</dt><dd>{{ JSON.stringify(jobFiltersFrom(params)) }}</dd>
          <dt>jobFiltersQuery</dt><dd>{{ JSON.stringify(jobFiltersQuery(jobFiltersFrom(params))) }}</dd>
          <dt>auditFiltersFrom</dt><dd>{{ JSON.stringify(auditFiltersFrom(params)) }}</dd>
          <dt>auditFiltersQuery</dt><dd>{{ JSON.stringify(auditFiltersQuery(auditFiltersFrom(params))) }}</dd>
          <dt>safeNext</dt><dd>{{ safeNext(params.next, { home: '/manage' }) }}</dd>
        </dl>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
dt { color: var(--vxp-muted); }
dd { margin: 0; overflow-wrap: anywhere; }
</style>
