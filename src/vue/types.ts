/** The job queue's filters, as JobsBrowser's `v-model:filters`. */
export interface JobFilters {
  /** A tab (`all`, `active`, `stopped`, `queued`, `running`, `failed`, `succeeded`) or a single state. */
  state: string
  kind: string
  /** `type:id`. */
  subject: string
  /** Also list dismissed runs under the Needs attention and Failed tabs. */
  showDismissed?: boolean
}

/** The audit filters, as AuditBrowser's `v-model:filters`. All but `scope` are typed by the user. */
export interface AuditFilters {
  /** A prefix with a trailing dot (`vod.`), or an exact action. */
  action: string
  /** A type with a trailing colon (`vod:`), or an exact target. */
  target: string
  /** `me` or a login (`@login` works too). */
  actor: string
  actor_kind: string
  outcome: string
  scope: string
}
