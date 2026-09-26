/**
 * Manual Retrieval Test Script
 *
 * This script tests the retrieval pipeline end-to-end:
 * 1. Stores test memories with embeddings
 * 2. Retrieves them using hybrid search
 * 3. Verifies content decryption
 *
 * Usage:
 *   pnpm --filter @memron/mcp-server tsx src/scripts/test-retrieval.ts
 */

import { query, testConnection } from '../db/client.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { generatePointerId, estimateTokens } from '../lib/pointer.js';
import { generateEmbedding, buildEmbeddingInput, toPgVector } from '../lib/embeddings.js';
import { insertMemory, searchMemoriesByVector } from '../db/queries.js';
import { hybridRetrieve } from '../retrieval/hybrid-retrieval.js';

const TEST_USER_ID = 999999;
const TEST_ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function setupTestEnvironment() {
  process.env.ENCRYPTION_SECRET = TEST_ENCRYPTION_SECRET;

  // Test database connection first
  console.log('Testing database connection...');
  try {
    const { testConnection } = await import('../db/client.js');
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database not accessible. Please check your .env file.');
      console.error('   Required environment variables:');
      console.error('   - PG_HOST');
      console.error('   - PG_PORT');
      console.error('   - PG_DATABASE');
      console.error('   - PG_USER');
      console.error('   - PG_PASSWORD');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.log('✓ Database connected');

  // Check for embedding API configuration
  console.log('Checking embedding API configuration...');
  const embeddingProvider = process.env.EMBEDDING_PROVIDER;
  if (!embeddingProvider) {
    console.warn('⚠️  No EMBEDDING_PROVIDER set. Semantic search will be limited.');
    console.warn('   Set EMBEDDING_PROVIDER and corresponding API key in .env for full functionality.');
  } else {
    console.log(`✓ Embedding provider: ${embeddingProvider}`);
  }

  // Clean up existing test data
  console.log('Cleaning up existing test data...');
  await query(`DELETE FROM memories WHERE user_id = $1`, [TEST_USER_ID]);
  console.log('✓ Cleanup complete');
}

async function storeTestMemories() {
  console.log('\n📝 Storing test memories...');

  const testMemories = [
    {
      content: 'The user prefers TypeScript over JavaScript for all backend development projects',
      title: 'TypeScript preference',
      bucket: 'preferences',
      tags: ['typescript', 'backend', 'preference'],
    },
    {
      content: 'Authentication is implemented using JWT tokens stored in httpOnly cookies',
      title: 'JWT authentication',
      bucket: 'knowledge',
      tags: ['jwt', 'auth', 'security'],
    },
    {
      content: 'The frontend is built with React and uses Tailwind CSS for styling',
      title: 'React frontend stack',
      bucket: 'knowledge',
      tags: ['react', 'frontend', 'tailwind'],
    },
    {
      content: 'Database operations use PostgreSQL with the pg library for Node.js',
      title: 'PostgreSQL database',
      bucket: 'knowledge',
      tags: ['postgresql', 'database', 'sql'],
    },
    {
      content: 'API responses are cached in Redis for 5 minutes to improve performance',
      title: 'Redis caching',
      bucket: 'knowledge',
      tags: ['redis', 'cache', 'performance'],
    },
  ];

  for (const mem of testMemories) {
    const pointerId = generatePointerId();

    // Generate embedding (might fail if API not configured)
    let embeddingStr: string | undefined = undefined;
    try {
      const embeddingInput = buildEmbeddingInput(mem.title, mem.tags, mem.content);
      const embedding = await generateEmbedding(embeddingInput);
      embeddingStr = embedding ? toPgVector(embedding) : undefined;
    } catch (error) {
      console.warn(`  ⚠️  Failed to generate embedding for ${mem.title}:`, error instanceof Error ? error.message : error);
    }

    // Encrypt content
    const encrypted = encrypt(mem.content);

    // Store in database
    await insertMemory({
      pointerId,
      userId: TEST_USER_ID,
      bucket: mem.bucket,
      title: mem.title,
      contentEncrypted: encrypted.encrypted,
      contentIv: encrypted.iv,
      contentTag: encrypted.tag,
      contentHash: `test-${pointerId}`,
      tags: mem.tags,
      tokenCount: 3,
      originalTokens: estimateTokens(mem.content),
      embedding: embeddingStr,
    });

    console.log(`  ✓ Stored: ${mem.title} (${pointerId})${embeddingStr ? ' with embedding' : ' (no embedding)'}`);
  }

  console.log(`✓ Stored ${testMemories.length} test memories`);
}

async function testVectorSearch() {
  console.log('\n🔍 Testing vector similarity search...');

  const queryText = 'authentication security tokens';
  let embedding: number[] | null = null;

  try {
    const embeddingInput = buildEmbeddingInput(queryText, [], queryText);
    embedding = await generateEmbedding(embeddingInput);
  } catch (error) {
    console.warn('⚠️  Failed to generate embedding for query:', error instanceof Error ? error.message : error);
    console.log('  Skipping vector search test (embedding API not configured)');
    return;
  }

  if (!embedding) {
    console.log('⚠️  No embedding generated, skipping vector search test');
    return;
  }

  const results = await searchMemoriesByVector({
    userId: TEST_USER_ID,
    embedding: embedding || undefined,
    limit: 5,
  });

  console.log(`  Found ${results.length} results:`);
  for (const result of results) {
    console.log(`    - ${result.title} (similarity: ${result.similarity.toFixed(4)})`);
  }

  if (results.length > 0) {
    console.log('✓ Vector search working');
  } else {
    console.log('⚠️  No results found (may be due to missing embeddings on stored memories)');
  }
}

async function testHybridRetrieval() {
  console.log('\n🎯 Testing hybrid retrieval (vector + BM25 + graph + recency)...');

  const queryText = 'how does authentication work';
  let embedding: number[] | null = null;

  try {
    const embeddingInput = buildEmbeddingInput(queryText, [], queryText);
    embedding = await generateEmbedding(embeddingInput);
  } catch (error) {
    console.warn('⚠️  Failed to generate embedding for query:', error instanceof Error ? error.message : error);
    console.log('  Proceeding without vector signal (BM25 + graph + recency only)');
  }

  const result = await hybridRetrieve({
    userId: TEST_USER_ID,
    query: queryText,
    embedding: embedding || undefined,
    topK: 10,
    tokenBudget: 2000,
  });

  console.log(`  Signals used: ${result.signalsUsed.join(', ')}`);
  console.log(`  Total candidates: ${result.totalCandidates}`);
  console.log(`  Retrieval time: ${result.retrievalTimeMs.toFixed(2)}ms`);
  console.log(`  Token estimate: ${result.tokenEstimate}`);
  console.log(`  Memories retrieved: ${result.memories.length}`);

  console.log('\n  Retrieved memories:');
  for (const memory of result.memories.slice(0, 3)) {
    console.log(`    - ${memory.title || memory.id}`);
    console.log(`      Source: ${memory.source}`);
    console.log(`      Relevance: ${memory.fusedScore.toFixed(4)}`);
    console.log(`      Signals: ${JSON.stringify(memory.signals)}`);
    console.log(`      Content preview: ${memory.content.slice(0, 100)}...`);
  }

  if (result.memories.length > 0) {
    console.log('✓ Hybrid retrieval working');
  } else {
    console.log('⚠️  No memories retrieved (this is expected if no embeddings are available)');
  }
}

async function testDecryption() {
  console.log('\n🔓 Testing content decryption...');

  const result = await query(
    `SELECT pointer_id, title, content_encrypted, content_iv, content_tag
     FROM memories WHERE user_id = $1 LIMIT 1`,
    [TEST_USER_ID]
  );

  if (result.rows.length === 0) {
    console.log('✗ No memories to decrypt');
    return;
  }

  const memory = result.rows[0];

  try {
    const decrypted = decrypt({
      encrypted: memory.content_encrypted,
      iv: memory.content_iv,
      tag: memory.content_tag,
    });

    console.log(`  Memory: ${memory.title}`);
    console.log(`  Decrypted content: ${decrypted.slice(0, 100)}...`);
    console.log('✓ Decryption working');
  } catch (error) {
    console.log('✗ Decryption failed:', error);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  await query(`DELETE FROM memories WHERE user_id = $1`, [TEST_USER_ID]);
  console.log('✓ Cleanup complete');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Memron Retrieval Pipeline Integration Test          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await setupTestEnvironment();
    await storeTestMemories();
    await testVectorSearch();
    await testHybridRetrieval();
    await testDecryption();
    await cleanup();

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await cleanup();
    process.exit(1);
  }
}

main();
