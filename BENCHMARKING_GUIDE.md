# Memron Benchmarking Guide

## Quick Start

To run the production-level benchmark suite that tests the 5 critical failure modes:

```bash
cd services/mcp-server
pnpm benchmark:production
```

This will test:
1. **Single-hop recall** - Basic fact retrieval
2. **Multi-hop recall** - Knowledge graph traversal
3. **Temporal resolution** - Contradiction handling
4. **Distractor rejection** - Semantic filtering
5. **Abstention** - Not hallucinating when nothing exists

## Available Benchmark Commands

```bash
# Production benchmark suite (recommended)
pnpm benchmark:production

# Basic competitive benchmark
pnpm benchmark

# Manual retrieval test
pnpm test:retrieval

# Integration tests
pnpm test:integration

# All tests
pnpm test
```

## Understanding the Results

### What Makes Memron Different

Memron's competitive advantages come from:

1. **Hybrid 4-Signal Retrieval**: Vector + BM25 + Graph + Recency
2. **Knowledge Graph**: Multi-hop reasoning through entity relationships
3. **Temporal Validity**: Bi-temporal fields for contradiction handling
4. **Token Efficiency**: Adaptive budgeting and memory compression
5. **Abstention Capability**: Confidence-based filtering to avoid hallucination

### Key Metrics to Watch

| Metric | What It Measures | Target | Why It Matters |
|--------|------------------|--------|----------------|
| **Precision @10** | Relevant/Retrieved | ≥ 80% | Don't return garbage |
| **Recall @10** | Retrieved/Relevant | ≥ 80% | Find what you need |
| **Multi-hop Recall** | Graph traversal success | ≥ 60% | Knowledge graph value |
| **Temporal Resolution** | Correct version returned | ≥ 90% | Contradiction handling |
| **Token Efficiency** | Tokens per correct answer | ≤ 3000 | Cost optimization |
| **Hallucination Rate** | Irrelevant results | ≤ 20% | Trust and accuracy |
| **Abstention Rate** | Correct "no result" responses | 100% | Avoid false positives |

## Competitive Comparison

### Memron vs Mem0 vs Supermemory

| Capability | Memron | Mem0 | Supermemory |
|------------|--------|------|-------------|
| **Hybrid Retrieval** | ✅ 4-signal | ⚠️ Vector-focused | ⚠️ Vector-focused |
| **Knowledge Graph** | ✅ Full entity relationships | ⚠️ Limited | ❌ No |
| **Multi-hop Reasoning** | ✅ Graph traversal | ❌ Basic | ❌ No |
| **Temporal Resolution** | ✅ Bi-temporal fields | ⚠️ Basic versioning | ❌ No |
| **Token Efficiency** | ✅ Adaptive budgeting | ⚠️ Standard | ⚠️ Standard |
| **Abstention** | ✅ Confidence-based | ⚠️ Limited | ⚠️ Limited |
| **Encryption** | ✅ Per-memory AES-256 | ⚠️ Optional | ⚠️ Optional |
| **Forensic Auditing** | ✅ Pre-mutation snapshots | ❌ No | ❌ No |

## Expected Performance

Based on architecture, Memron should achieve:

- **Single-hop**: 85% precision, 85% recall
- **Multi-hop**: 70% recall, 0.6 MRR
- **Temporal**: 95% precision, 0% hallucination
- **Distractor**: 75% precision, 20% hallucination
- **Abstention**: 100% correct abstention
- **Token efficiency**: 2,500 tokens per answer

## Troubleshooting Benchmark Failures

### Low Single-hop Scores
**Problem**: Can't retrieve basic facts

**Solutions**:
- Check embedding generation is working
- Verify embeddings are being stored with memories
- Ensure embedding dimensions match pgvector index

### Low Multi-hop Scores
**Problem**: Knowledge graph not being used

**Solutions**:
- Verify entity extraction is working
- Check entity relationships are being created
- Ensure graph signal weight is sufficient in hybrid retrieval

### Temporal Hallucination
**Problem**: Old versions being returned

**Solutions**:
- Verify `valid_to` is being set correctly
- Check queries filter by temporal validity
- Ensure `supersedes_memory_id` is being used

### High Distractor Rate
**Problem**: Irrelevant memories returned

**Solutions**:
- Adjust BM25 signal weight
- Improve embedding quality
- Strengthen graph relationship scoring

### Poor Abstention
**Problem**: Hallucinating non-existent information

**Solutions**:
- Implement confidence thresholding
- Add minimum similarity threshold
- Return empty results for low-confidence queries

## Integration with CI/CD

Add to your CI pipeline:

```yaml
- name: Run Production Benchmarks
  run: pnpm benchmark:production
- name: Check Performance Regression
  run: |
    # Fail if key metrics drop below thresholds
    # Alert if token efficiency degrades
    # Block deployment if temporal resolution fails
```

## Documentation

- **RETRIEVAL_REDESIGN.md**: Detailed redesign documentation
- **PRODUCTION_BENCHMARKS.md**: In-depth benchmark methodology
- **CLAUDE.md**: Project context and architecture

## Support

For benchmark issues:
1. Check database connection in `.env`
2. Verify embedding API configuration
3. Ensure analysis migrations are run: `pnpm db:migrate:analysis`
4. Check pgvector extension is enabled

## Next Steps

1. Run production benchmarks: `pnpm benchmark:production`
2. Review results against targets
3. Identify areas for improvement
4. Optimize signal weights based on results
5. Set up continuous benchmarking in CI/CD
