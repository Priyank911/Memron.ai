'use client';

import { useState } from 'react';
import { X, Share2, Loader2, CheckCircle, AlertCircle, Mail, MessageSquare } from 'lucide-react';

interface Bucket {
  id: string;
  name: string;
  slug: string;
  memoryCount: number;
}

interface ShareBucketModalProps {
  open: boolean;
  onClose: () => void;
  buckets: Bucket[];
  onShareComplete?: () => void;
}

type ShareState = 'idle' | 'sending' | 'success' | 'error';

export function ShareBucketModal({ open, onClose, buckets, onShareComplete }: ShareBucketModalProps) {
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<ShareState>('idle');
  const [resultMsg, setResultMsg] = useState('');

  if (!open) return null;

  const handleClose = () => {
    setSelectedBucket('');
    setEmail('');
    setMessage('');
    setState('idle');
    setResultMsg('');
    onClose();
  };

  const handleShare = async () => {
    if (!selectedBucket || !email.trim()) return;

    setState('sending');
    setResultMsg('');

    try {
      // Find the selected bucket to send slug (consistent across DBs)
      const bucket = buckets.find((b) => b.id === selectedBucket || b.slug === selectedBucket);
      const res = await fetch('/api/dashboard/buckets/share', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucketId: selectedBucket,
          bucketSlug: bucket?.slug,
          email: email.trim(),
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setState('success');
        const name = data.share?.targetName || email.trim();
        setResultMsg(`Bucket shared successfully with ${name}! They'll get a notification.`);
        onShareComplete?.();
      } else {
        setState('error');
        setResultMsg(data.error || 'Failed to share bucket');
      }
    } catch (err: any) {
      setState('error');
      setResultMsg(err.message || 'Network error — please try again');
    }
  };

  const isValid = selectedBucket && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nonDefaultBuckets = buckets.filter((b) => b.slug !== 'main');

  return (
    <div className="db-share-overlay" onClick={handleClose}>
      <div className="db-share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="db-share-header">
          <div className="db-share-header-left">
            <Share2 size={16} className="db-share-header-icon" />
            <h2 className="db-share-title">Share Bucket</h2>
          </div>
          <button className="db-share-close" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="db-share-body">
          {state === 'success' ? (
            <div className="db-share-result success">
              <CheckCircle size={32} />
              <p>{resultMsg}</p>
              <button className="db-share-btn-primary" onClick={handleClose}>Done</button>
            </div>
          ) : (
            <>
              <p className="db-share-desc">
                Share a copy of a bucket and its memories with another Memron user.
                They&apos;ll receive the full context in their dashboard.
              </p>

              {/* Bucket picker */}
              <label className="db-share-label">Select Bucket</label>
              {nonDefaultBuckets.length === 0 ? (
                <div className="db-share-empty">
                  <p>No shareable buckets found. Create a sub-bucket first.</p>
                </div>
              ) : (
                <div className="db-share-bucket-list">
                  {nonDefaultBuckets.map((b) => (
                    <button
                      key={b.id}
                      className={`db-share-bucket-item${selectedBucket === b.id ? ' selected' : ''}`}
                      onClick={() => setSelectedBucket(b.id)}
                    >
                      <span className="db-share-bucket-dot" />
                      <span className="db-share-bucket-name">{b.name}</span>
                      <span className="db-share-bucket-count">{b.memoryCount} memories</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Email input */}
              <label className="db-share-label">
                <Mail size={12} />
                Recipient Email
              </label>
              <input
                type="email"
                className="db-share-input"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setState('idle'); setResultMsg(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && isValid) handleShare(); }}
              />

              {/* Optional message */}
              <label className="db-share-label">
                <MessageSquare size={12} />
                Message <span className="db-share-optional">(optional)</span>
              </label>
              <textarea
                className="db-share-textarea"
                placeholder="Hey! Check out this context bucket..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={500}
              />

              {/* Error banner */}
              {state === 'error' && resultMsg && (
                <div className="db-share-error">
                  <AlertCircle size={14} />
                  <span>{resultMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="db-share-actions">
                <button className="db-share-btn-ghost" onClick={handleClose}>Cancel</button>
                <button
                  className="db-share-btn-primary"
                  disabled={!isValid || state === 'sending'}
                  onClick={handleShare}
                >
                  {state === 'sending' ? (
                    <>
                      <Loader2 size={14} className="db-spin" />
                      Sharing…
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      Share Bucket
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
