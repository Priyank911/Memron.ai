'use client';

import { useState } from 'react';
import { X, FolderPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface CreateBucketModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type ModalState = 'idle' | 'creating' | 'success' | 'error';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RESERVED_SLUGS = ['main', 'conversation', 'tool-results', 'preferences', 'knowledge', 'system', 'custom'];

export function CreateBucketModal({ open, onClose, onCreated }: CreateBucketModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState('');
  const [state, setState] = useState<ModalState>('idle');
  const [resultMsg, setResultMsg] = useState('');

  if (!open) return null;

  const handleClose = () => {
    setName('');
    setSlug('');
    setSlugManual(false);
    setDescription('');
    setState('idle');
    setResultMsg('');
    onClose();
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugManual) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManual(true);
    setSlug(slugify(val));
  };

  const isReserved = RESERVED_SLUGS.includes(slug);
  const isValid = name.trim().length > 0 && slug.length > 0 && !isReserved;

  const handleCreate = async () => {
    if (!isValid) return;

    setState('creating');
    setResultMsg('');

    try {
      const res = await fetch('/api/dashboard/buckets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.bucket) {
        setState('success');
        setResultMsg(`Sub-bucket "${data.bucket.name}" created! You can now store memories in it via MCP or the dashboard.`);
        onCreated?.();
      } else {
        setState('error');
        setResultMsg(data.error || 'Failed to create bucket');
      }
    } catch (err: any) {
      setState('error');
      setResultMsg(err.message || 'Network error — please try again');
    }
  };

  return (
    <div className="db-create-bucket-overlay" onClick={handleClose}>
      <div className="db-create-bucket-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="db-create-bucket-header">
          <div className="db-create-bucket-header-left">
            <FolderPlus size={16} className="db-create-bucket-header-icon" />
            <h2 className="db-create-bucket-title">Create Sub-Bucket</h2>
          </div>
          <button className="db-create-bucket-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="db-create-bucket-body">
          {state === 'success' ? (
            <div className="db-create-bucket-result success">
              <CheckCircle size={32} />
              <p>{resultMsg}</p>
              <button className="db-create-bucket-btn-primary" onClick={handleClose}>Done</button>
            </div>
          ) : (
            <>
              <p className="db-create-bucket-desc">
                Create a sub-bucket inside your main bucket to organize memories by topic, project, or purpose.
                AI agents can store data directly into this bucket via MCP.
              </p>

              {/* Name input */}
              <div className="db-create-bucket-field">
                <label className="db-create-bucket-label">Bucket Name</label>
                <input
                  type="text"
                  className="db-create-bucket-input"
                  placeholder="e.g. Project Notes, Meeting Logs, Research"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  maxLength={255}
                  disabled={state === 'creating'}
                />
              </div>

              {/* Slug input */}
              <div className="db-create-bucket-field">
                <label className="db-create-bucket-label">
                  Slug
                  <span className="db-create-bucket-label-hint">(used in MCP &amp; API)</span>
                </label>
                <input
                  type="text"
                  className={`db-create-bucket-input mono${isReserved ? ' error' : ''}`}
                  placeholder="auto-generated-from-name"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  maxLength={100}
                  disabled={state === 'creating'}
                />
                {isReserved && (
                  <span className="db-create-bucket-field-error">
                    &quot;{slug}&quot; is reserved. Choose a different slug.
                  </span>
                )}
                {slug && !isReserved && (
                  <span className="db-create-bucket-field-hint">
                    Store memories with: <code>bucket: &quot;{slug}&quot;</code>
                  </span>
                )}
              </div>

              {/* Description input */}
              <div className="db-create-bucket-field">
                <label className="db-create-bucket-label">
                  Description
                  <span className="db-create-bucket-label-hint">(optional)</span>
                </label>
                <textarea
                  className="db-create-bucket-textarea"
                  placeholder="What kind of data will go in this bucket?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  disabled={state === 'creating'}
                />
              </div>

              {/* Error banner */}
              {state === 'error' && (
                <div className="db-create-bucket-error-banner">
                  <AlertCircle size={14} />
                  <span>{resultMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="db-create-bucket-actions">
                <button className="db-create-bucket-btn-ghost" onClick={handleClose} disabled={state === 'creating'}>
                  Cancel
                </button>
                <button
                  className="db-create-bucket-btn-primary"
                  onClick={handleCreate}
                  disabled={!isValid || state === 'creating'}
                >
                  {state === 'creating' ? (
                    <>
                      <Loader2 size={14} className="db-spinner" /> Creating…
                    </>
                  ) : (
                    <>
                      <FolderPlus size={14} /> Create Bucket
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
