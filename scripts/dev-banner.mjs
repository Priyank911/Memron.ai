/**
 * Print a clean startup banner before turbo dev runs.
 * Called via: node scripts/dev-banner.mjs && turbo dev
 */

const services = [
  { name: 'Landing', url: 'http://localhost:3000' },
  { name: 'Dashboard', url: 'http://localhost:3000/dashboard' },
  { name: 'Gateway', url: 'http://localhost:5000' },
  { name: 'Tunnel API', url: 'http://localhost:5200' },
  { name: 'MCP Server', url: 'http://localhost:4201/mcp' },
];

console.log();
console.log('  Memron Dev');
console.log('  ─────────────────────────────────────');
for (const s of services) {
  console.log(`  ${s.name.padEnd(14)} >> ${s.url}`);
}
console.log('  ─────────────────────────────────────');
console.log();
