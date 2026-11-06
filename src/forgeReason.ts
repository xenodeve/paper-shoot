/** Why the forge fell back offline. Shared by the server (what to retry) and the UI (what to say),
 *  so the two cannot drift. The server's reason is `no-key`, `timeout`, `http-<status>[:<type>]`
 *  or a referee error. */
export type FallbackKind = 'no-key' | 'timeout' | 'busy' | 'other';

/** A busy provider (429, 5xx): worth a retry, and not the AI's fault. */
export const isBusy = (reason: string) => /^http-(429|5\d\d)(:|$)/.test(reason);

/** The suffix of the `forge.offlineWhy.*` i18n key. */
export function fallbackKind(reason: string): FallbackKind {
  if (reason === 'no-key' || reason === 'timeout') return reason;
  return isBusy(reason) ? 'busy' : 'other';
}
