/**
 * Input Guard — Validates and sanitizes user queries before they enter the RAG+LLM pipeline.
 *
 * Protections:
 *   1. Length bounds (min 1, max 500 chars)
 *   2. Prompt injection detection — blocks attempts to override system prompts,
 *      extract internal instructions, or manipulate LLM behavior
 *   3. Unicode normalization — prevents homoglyph/invisible-char attacks
 *   4. Control character stripping
 *
 * Security: All checks run BEFORE any DB or LLM call to fail fast and cheaply.
 */

// ─── Types ───────────────────────────────────────────────────

export interface GuardResult {
  ok: boolean;
  sanitized: string;
  rejection?: string;
}

// ─── Injection patterns ──────────────────────────────────────
// These detect common prompt injection and jailbreak techniques.
// Patterns are anchored or broad enough to catch obfuscated variants.
// Note: We never log the raw user input to avoid log injection.

const INJECTION_PATTERNS: RegExp[] = [
  // Direct system prompt override
  /\b(ignore|forget|disregard|override|bypass)\b.*\b(previous|above|system|instructions?|prompt|rules?)\b/i,
  // Roleplaying jailbreaks
  /\b(you are now|act as|pretend to be|roleplay as|simulate)\b/i,
  // Extraction attempts
  /\b(reveal|show|print|output|repeat|echo)\b.*\b(system\s*prompt|instructions?|hidden|secret|internal)\b/i,
  // DAN / jailbreak patterns
  /\bDAN\b|Do Anything Now/i,
  // Markdown/code block injection trying to escape context
  /```\s*(system|assistant|function_call)/i,
  // Attempts to simulate API responses or tool calls
  /\b(function_call|tool_use|<\|im_start\||<\|system\|>)/i,
  // Base64 payload smuggling
  /[A-Za-z0-9+/]{60,}={0,2}/,
  // Attempts to exfiltrate data via URLs
  /\b(fetch|curl|wget|http[s]?:\/\/)\b/i,
];

// ─── Sanitizer ───────────────────────────────────────────────

/**
 * Normalize unicode, strip control chars, collapse whitespace.
 */
function sanitize(raw: string): string {
  // NFC normalization — collapses homoglyphs and combining marks
  let s = raw.normalize('NFC');
  // Strip all control characters except newline and tab
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  // Replace zero-width chars (used to hide injections)
  s = s.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
  // Collapse runs of whitespace (keep single newlines)
  s = s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// ─── Guard ───────────────────────────────────────────────────

export function guardInput(raw: unknown): GuardResult {
  // Type check
  if (typeof raw !== 'string') {
    return { ok: false, sanitized: '', rejection: 'Query must be a string.' };
  }

  const sanitized = sanitize(raw);

  // Length bounds
  if (sanitized.length === 0) {
    return { ok: false, sanitized: '', rejection: 'Query cannot be empty.' };
  }
  if (sanitized.length > 500) {
    return { ok: false, sanitized: '', rejection: 'Query too long (max 500 characters).' };
  }

  // Injection detection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      return {
        ok: false,
        sanitized: '',
        rejection: 'Your query contains patterns that cannot be processed. Please rephrase.',
      };
    }
  }

  return { ok: true, sanitized };
}
