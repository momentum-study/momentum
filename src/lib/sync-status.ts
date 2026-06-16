// Sync status notifier: broadcasts sync failures to any UI consumer.
// Used by data-sync.ts to surface push errors (quota, ad-blocker, etc.) to the user.

export interface SyncStatus {
  notifyFailure(message: string): void
  notifySuccess(): void
}

const FAILURE_EVENT = 'momentum-sync-failure'
const SUCCESS_EVENT = 'momentum-sync-success'

export const syncStatus: SyncStatus = {
  notifyFailure(message: string) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(FAILURE_EVENT, { detail: { message } }))
  },
  notifySuccess() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(SUCCESS_EVENT))
  },
}

export const SYNC_FAILURE_EVENT = FAILURE_EVENT
export const SYNC_SUCCESS_EVENT = SUCCESS_EVENT
