/**
 * Log Privacy — user content must never reach logs.
 *
 * Render/Cloudflare logs are operational telemetry, not a data store, and may
 * be visible to people who must never see memory content, queries, or titles.
 * All values here are parameterized ($1, $2…), so SQL templates are safe —
 * but raw query text, titles, and embedding inputs are NOT. Log a stable
 * hash prefix + length instead: enough to correlate (same input → same hash)
 * without revealing a single character.
 */
import { createHash } from 'node:crypto';

export interface LogSafeText {
  hash: string;
  len: number;
}

/** Stable, non-reversible fingerprint for log correlation. */
export function fingerprint(text: string): LogSafeText {
  const input = text ?? '';
  return {
    hash: `sha256:${createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16)}`,
    len: input.length,
  };
}
