/**
 * Runtime smoke test for the WorkOS session seal (no WorkOS API needed).
 * Run: node scripts/test-session-seal.mjs
 */
process.env.WORKOS_COOKIE_PASSWORD = 'test-secret-'.padEnd(40, 'x');

const path = await import('node:path');
const fs = await import('node:fs');
const { execSync } = await import('node:child_process');

// Compile src/lib/session.ts to CJS in a temp dir using the workspace tsc
execSync(
  'pnpm exec tsc src/lib/session.ts --outDir .seal-test-tmp --module commonjs --target es2020 --esModuleInterop --skipLibCheck',
  { cwd: path.resolve('apps/landing'), stdio: 'inherit', timeout: 120000 },
);

const script = `
import { sealSession, unsealSession, looksLikeSealedSession, SESSION_TTL_SECONDS } from './.seal-test-tmp/session.js';
import assert from 'node:assert';

const claims = {
  sub: 'user_01TEST',
  email: 'test@example.com',
  emailVerified: false,
  firstName: 'Test',
  lastName: 'User',
  fullName: 'Test User',
  imageUrl: null,
  provider: 'password',
};

// 1. Round trip
const sealed = sealSession(claims);
assert.ok(sealed, 'seal produced');
assert.equal(sealed.split('.').length, 4, '4 segments');
assert.equal(sealed.split('.')[0], 'v1', 'version prefix');
assert.ok(looksLikeSealedSession(sealed), 'middleware format check passes');
const unsealed = unsealSession(sealed);
assert.deepEqual({ ...unsealed, iat: 0, exp: 0 }, { ...claims, iat: 0, exp: 0 }, 'claims round-trip');
console.log('PASS round-trip + format check');

// 2. Tamper detection (flip ciphertext)
const parts = sealed.split('.');
const flipped = parts[2].endsWith('AA') ? 'BB' : 'AA';
const tampered = [parts[0], parts[1], parts[2].slice(0, -2) + flipped, parts[3]].join('.');
assert.equal(unsealSession(tampered), null, 'tampered rejected by GCM tag');
console.log('PASS tamper rejection');

// 3. Garbage inputs (including legacy Firebase JWT shapes)
for (const bad of [undefined, null, '', 'undefined', 'null', 'abc', 'v1.a.b', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig']) {
  assert.equal(unsealSession(bad), null, 'unseal rejects: ' + String(bad).slice(0, 24));
  if (typeof bad === 'string') assert.equal(looksLikeSealedSession(bad), false, 'format rejects: ' + bad.slice(0, 24));
}
console.log('PASS garbage input rejection');

// 4. Expiry
const shortLived = sealSession(claims, -1);
assert.equal(unsealSession(shortLived), null, 'expired seal rejected');
const longLived = sealSession(claims, SESSION_TTL_SECONDS);
assert.ok(unsealSession(longLived), 'valid TTL accepted');
console.log('PASS expiry handling');

// Emit the sealed token for the cross-process wrong-key check (step 5 runs
// from the outer script, because the derived key is cached per process).
process.stdout.write('SEALED::' + sealed);
`;

try {
  const tmpFile = path.resolve('apps/landing/.seal-test.mjs');
  fs.writeFileSync(tmpFile, script);
  const output = execSync('node .seal-test.mjs', {
    cwd: path.resolve('apps/landing'),
    env: process.env,
    timeout: 60000,
    encoding: 'utf8',
  });
  // Print test progress lines (strip the trailing SEALED:: marker)
  const marker = 'SEALED::';
  const idx = output.lastIndexOf(marker);
  if (idx === -1) throw new Error('Sealed token not returned by inner test');
  process.stdout.write(output.slice(0, idx));
  const sealedToken = output.slice(idx + marker.length).trim();

  // Step 5: wrong key must be rejected (fresh process => freshly derived key)
  const crossCheck =
    "import { unsealSession } from './.seal-test-tmp/session.js';\n" +
    'const sealed = ' + JSON.stringify(sealedToken) + ';\n' +
    "if (unsealSession(sealed) !== null) { console.error('FAIL: wrong-key seal accepted'); process.exit(1); }\n" +
    "console.log('PASS wrong-key rejection');\n" +
    "console.log('');\n" +
    "console.log('ALL SESSION SEAL TESTS PASSED');\n";
  fs.writeFileSync(path.resolve('apps/landing/.wrong-key-check.mjs'), crossCheck);
  execSync('node .wrong-key-check.mjs', {
    cwd: path.resolve('apps/landing'),
    stdio: 'inherit',
    env: { ...process.env, WORKOS_COOKIE_PASSWORD: 'a-completely-different-secret-value-42' },
    timeout: 60000,
  });
} catch (e) {
  process.exitCode = 1;
} finally {
  try {
    fs.rmSync(path.resolve('apps/landing/.seal-test.mjs'), { force: true });
    fs.rmSync(path.resolve('apps/landing/.wrong-key-check.mjs'), { force: true });
    fs.rmSync(path.resolve('apps/landing/.seal-test-tmp'), { recursive: true, force: true });
  } catch { /* cleanup */ }
}
