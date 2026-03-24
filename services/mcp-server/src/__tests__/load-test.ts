/**
 * Load Test Script — uses autocannon to stress-test the MCP server.
 *
 * This is NOT a vitest test. Run manually:
 *   pnpm --filter @memron/mcp-server load-test
 *
 * Prerequisites:
 *   - MCP server running on localhost:5201
 *   - Docker Compose with Postgres up
 */
import autocannon from 'autocannon';

const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:5201';

interface Scenario {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  connections: number;
  duration: number;
}

const scenarios: Scenario[] = [
  {
    name: 'Health endpoint baseline',
    url: `${BASE_URL}/health`,
    method: 'GET',
    connections: 50,
    duration: 10,
  },
  {
    name: 'Root info endpoint',
    url: `${BASE_URL}/`,
    method: 'GET',
    connections: 50,
    duration: 10,
  },
  {
    name: 'OAuth metadata',
    url: `${BASE_URL}/.well-known/oauth-authorization-server`,
    method: 'GET',
    connections: 20,
    duration: 10,
  },
  {
    name: 'MCP endpoint under load (no auth — expects 401s)',
    url: `${BASE_URL}/mcp`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    connections: 20,
    duration: 10,
  },
  {
    name: 'Rate limit verification (/auth/test)',
    url: `${BASE_URL}/auth/test`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: 'mm_live_test_fake_key_here_padded_to_56chars00000000' }),
    connections: 5,
    duration: 30,
  },
];

async function runScenario(scenario: Scenario): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${scenario.name}`);
  console.log(`  ${scenario.method} ${scenario.url}`);
  console.log(`  Connections: ${scenario.connections} | Duration: ${scenario.duration}s`);
  console.log('='.repeat(60));

  const result = await autocannon({
    url: scenario.url,
    method: scenario.method,
    connections: scenario.connections,
    duration: scenario.duration,
    headers: scenario.headers,
    body: scenario.body,
  });

  console.log(`\n  Requests:    ${result.requests.total}`);
  console.log(`  Throughput:  ${result.requests.average} req/s (avg)`);
  console.log(`  Latency:     p50=${(result.latency as any).p50}ms  p95=${(result.latency as any).p95}ms  p99=${(result.latency as any).p99}ms`);
  console.log(`  Errors:      ${result.errors}`);

  // Check for 429 rate-limited responses
  const status429 = (result as any)['429'] || 0;
  if (status429 > 0) {
    console.log(`  429 (rate limited): ${status429}`);
  }

  // Summarize non-2xx responses
  const non2xx = result.non2xx;
  if (non2xx > 0) {
    console.log(`  Non-2xx:     ${non2xx}`);
  }

  console.log('');
}

async function main() {
  console.log('\n🔥 Memron MCP Server — Load Test Suite');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Scenarios: ${scenarios.length}\n`);

  // Quick health check
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) {
      console.error(`Server health check failed (${res.status}). Is the server running?`);
      process.exit(1);
    }
    console.log('   Health check: OK\n');
  } catch {
    console.error(`Cannot reach ${BASE_URL}. Start the server first:`);
    console.error('   pnpm --filter @memron/mcp-server dev');
    process.exit(1);
  }

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  console.log('\n✅ Load test complete.\n');
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
