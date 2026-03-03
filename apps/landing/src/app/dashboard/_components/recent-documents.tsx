'use client';

import { Download, Filter } from 'lucide-react';
import type { MemoryRow } from './types';

interface RecentDocumentsProps {
  documents: MemoryRow[];
}

export function RecentDocuments({ documents }: RecentDocumentsProps) {
  return (
    <div className="db-recent-docs">
      <div className="db-recent-docs-header">
        <div className="db-recent-docs-title">
          <h3>Recent Memories</h3>
          <span className="db-card-badge">{documents.length} total</span>
        </div>
        <button className="db-btn-ghost">
          <Filter size={13} /> Filter by bucket
        </button>
      </div>

      <div className="db-table-wrapper">
        <table className="db-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Content</th>
              <th>Type</th>
              <th>Tags</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr><td colSpan={6} className="db-table-empty">No memories found.</td></tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id}>
                  <td><input type="checkbox" className="db-checkbox" /></td>
                  <td className="db-table-content">{doc.content}</td>
                  <td><span className="db-cat-badge">text</span></td>
                  <td>
                    <div className="db-cat-badges">
                      {doc.categories.map((c) => (
                        <span key={c} className="db-cat-badge">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="db-table-time">{doc.time}</td>
                  <td>
                    <button className="db-table-action" title="Download">
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
