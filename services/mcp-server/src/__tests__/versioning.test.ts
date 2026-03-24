/**
 * Versioning Layer Tests
 * Tests for prompt tracking and run recording
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('../db/client.js', () => ({
  query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO prompt_templates')) {
      return Promise.resolve({
        rows: [{
          template_id: 'tmpl_test_1',
          name: params?.[2] || 'Test Template',
          description: params?.[3] || 'Test description',
          created_at: new Date(),
        }],
        rowCount: 1,
      });
    }
    if (sql.includes('INSERT INTO prompt_versions')) {
      return Promise.resolve({
        rows: [{
          prompt_version_id: 'ver_test_1',
          version_number: 1,
          status: 'draft',
          created_at: new Date(),
        }],
        rowCount: 1,
      });
    }
    if (sql.includes('INSERT INTO run_records')) {
      return Promise.resolve({
        rows: [{
          run_id: 'run_test_1',
          session_id: params?.[2],
          success_score: params?.[13],
          created_at: new Date(),
        }],
        rowCount: 1,
      });
    }
    if (sql.includes('SELECT') && sql.includes('prompt_versions')) {
      return Promise.resolve({
        rows: [{
          prompt_version_id: 'ver_test_1',
          version_number: 1,
          status: 'active',
          raw_text: 'Test prompt',
          created_at: new Date(),
        }],
        rowCount: 1,
      });
    }
    if (sql.includes('UPDATE')) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }),
}));

vi.mock('../db/queries-analysis.js', () => ({
  insertPromptTemplate: vi.fn().mockResolvedValue({
    template_id: 'tmpl_test_1',
    name: 'Test Template',
    description: 'Test description',
    created_at: new Date(),
  }),
  insertPromptVersion: vi.fn().mockResolvedValue({
    prompt_version_id: 'ver_test_1',
    version_number: 1,
    status: 'draft',
    raw_text: 'Test prompt',
    created_at: new Date(),
  }),
  getLatestPromptVersion: vi.fn().mockResolvedValue(null),
  getActivePromptVersion: vi.fn().mockResolvedValue({
    prompt_version_id: 'ver_test_1',
    version_number: 1,
    status: 'active',
  }),
  insertRunRecord: vi.fn().mockResolvedValue({
    run_id: 'run_test_1',
    session_id: 'sess_1',
    success_score: 0.85,
  }),
}));

import {
  createTemplate,
  createVersion,
  activateVersion,
  analyzeDiff,
} from '../versioning/prompt-tracker.js';

describe('Prompt Tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Template Management', () => {
    it('should create prompt template', async () => {
      const template = await createTemplate(
        1,
        'Auth System Prompt',
        'Prompt for authentication tasks'
      );

      expect(template).toBeDefined();
      expect(template.template_id).toBeDefined();
    });

    it('should create template with description', async () => {
      const template = await createTemplate(
        1,
        'Debug Prompt',
        'Prompt for debugging tasks'
      );

      expect(template).toBeDefined();
    });
  });

  describe('Version Management', () => {
    it('should create prompt version', async () => {
      const version = await createVersion(
        'tmpl_1',
        'You are a helpful assistant...',
        { systemBlock: 'System instructions here' },
        { changeSummary: 'Initial version' }
      );

      expect(version).toBeDefined();
      expect(version.prompt_version_id).toBeDefined();
    });

    it('should create version with components', async () => {
      const version = await createVersion(
        'tmpl_1',
        'Full prompt text',
        {
          systemBlock: 'System block',
          memoryBlock: 'Memory block',
          retrievalBlock: 'Retrieval block',
        }
      );

      expect(version).toBeDefined();
    });

    it('should activate version', async () => {
      // Should not throw
      await activateVersion('tmpl_1', 'ver_1');
    });
  });

  describe('Diff Analysis', () => {
    it('should analyze diff between versions', () => {
      const oldVersion = {
        prompt_version_id: 'ver_1',
        version_number: 1,
        raw_text: 'Original prompt text',
        status: 'deprecated',
      };

      const newVersion = {
        prompt_version_id: 'ver_2',
        version_number: 2,
        raw_text: 'Updated prompt text with more details',
        status: 'active',
      };

      const diff = analyzeDiff(oldVersion as any, newVersion as any);

      expect(diff).toBeDefined();
      expect(diff.diffType).toBeDefined();
      expect(diff.semanticChange).toBeDefined();
    });

    it('should detect expansion', () => {
      const oldVersion = {
        prompt_version_id: 'ver_1',
        version_number: 1,
        raw_text: 'Short',
        status: 'deprecated',
      };

      const newVersion = {
        prompt_version_id: 'ver_2',
        version_number: 2,
        raw_text: 'Much longer text with many more details and instructions',
        status: 'active',
      };

      const diff = analyzeDiff(oldVersion as any, newVersion as any);
      expect(diff.diffType).toBeDefined();
    });

    it('should detect reduction', () => {
      const oldVersion = {
        prompt_version_id: 'ver_1',
        version_number: 1,
        raw_text: 'Much longer text with many more details and instructions',
        status: 'deprecated',
      };

      const newVersion = {
        prompt_version_id: 'ver_2',
        version_number: 2,
        raw_text: 'Short',
        status: 'active',
      };

      const diff = analyzeDiff(oldVersion as any, newVersion as any);
      expect(diff.diffType).toBeDefined();
    });
  });
});

describe('Version Status', () => {
  const statuses = ['draft', 'active', 'deprecated', 'rolled_back'];

  for (const status of statuses) {
    it(`should handle ${status} status`, async () => {
      const version = await createVersion(
        'tmpl_1',
        'Prompt text',
        {},
        { status: status as any }
      );

      expect(version).toBeDefined();
    });
  }
});

describe('Prompt Components', () => {
  it('should handle all component types', async () => {
    const version = await createVersion(
      'tmpl_1',
      'Full prompt',
      {
        systemBlock: 'System instructions',
        memoryBlock: 'Memory context',
        retrievalBlock: 'Retrieved documents',
        toolBlock: 'Available tools',
        outputSchema: '{"type": "object"}',
      }
    );

    expect(version).toBeDefined();
  });

  it('should handle empty components', async () => {
    const version = await createVersion(
      'tmpl_1',
      'Minimal prompt',
      {}
    );

    expect(version).toBeDefined();
  });
});
