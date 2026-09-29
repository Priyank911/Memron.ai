/**
 * Environment Source Abstraction — one runtime, two homes.
 *
 * On Render/Node, configuration comes from `process.env`.
 * On Cloudflare Workers there is no `process.env`; bindings and secrets
 * arrive as the `env` argument of the fetch handler. `worker.ts` injects
 * them once per isolate via `setEnvSource()`; everything else keeps reading
 * through `getEnv()` and works unchanged on both runtimes.
 *
 * Rules:
 * - Node path: zero behavior change (reads process.env live, every access).
 * - Worker path: set once per isolate before first use; values are static
 *   per deployment so once-per-isolate init is race-safe.
 * - Never log values from here — secrets flow through this module.
 */

type EnvMap = Record<string, string | undefined>;

let override: EnvMap | null = null;

function nodeEnv(): EnvMap {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env as EnvMap;
    }
  } catch {
    /* runtimes without process */
  }
  return {};
}

/** Inject Worker bindings/secrets (or test doubles). Flattened to strings. */
export function setEnvSource(env: Record<string, unknown>): void {
  const flat: EnvMap = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === null || value === undefined) continue;
    flat[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  override = flat;
}

/** For tests: drop the injected source and read process.env again. */
export function resetEnvSource(): void {
  override = null;
}

/** Read one variable: injected source wins, then process.env, then fallback. */
export function getEnv(key: string, fallback = ''): string {
  if (override && Object.prototype.hasOwnProperty.call(override, key)) {
    return override[key] ?? fallback;
  }
  return nodeEnv()[key] ?? fallback;
}
