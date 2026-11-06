/** Why the forge fell back offline, as the suffix of a `forge.offlineWhy.*` i18n key.
 *  The server's reason is `no-key`, `timeout`, `http-<status>[:<type>]` or a referee error. */
export type FallbackKind = 'no-key' | 'timeout' | 'busy' | 'other';

export function fallbackKind(reason: string): FallbackKind {
  if (reason === 'no-key' || reason === 'timeout') return reason;
  if (/^http-(429|5\d\d)(:|$)/.test(reason)) return 'busy';
  return 'other';
}
