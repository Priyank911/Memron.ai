import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser } from '@/lib/supabase-read';
import { getUserFromPostgres, createNotification } from '@/lib/postgres';
import { cachedQuery, checkRateLimit, invalidateEndpoint, CACHE_PROFILES } from '@/lib/api-cache';

/**
 * POST /api/dashboard/buckets/share — Share a sub-bucket with another user
 *
 * Body: { bucketId: string, bucketSlug?: string, email: string, message?: string }
 *
 * IMPORTANT: The dashboard reads buckets from SUPABASE. So the entire share
 * flow must also run against Supabase — otherwise bucket_ids and user_ids
 * won't match (Aiven user=190 vs Supabase user=3).
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit sharing to 10 requests per minute
    const rl = checkRateLimit(authUser.uid, 'buckets', { ...CACHE_PROFILES.buckets, rateLimit: 10 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 60000) / 1000)) } },
      );
    }

    // Resolve sender in SUPABASE (same DB the bucket list comes from)
    const supaSender = await resolveSupabaseUser(authUser.uid);
    if (!supaSender) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Also get Aiven user for notifications (postgres.ts operates on Aiven)
    const aivenSender = await getUserFromPostgres(authUser.uid);

    const body = await request.json().catch(() => ({}));
    const { bucketId, bucketSlug, email, message } = body;

    // ── Validate inputs ──
    if (!bucketId && !bucketSlug) {
      return NextResponse.json({ error: 'Missing bucketId or bucketSlug' }, { status: 400 });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Missing recipient email address' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
    }

    if (normalizedEmail === supaSender.email?.toLowerCase()) {
      return NextResponse.json({ error: 'You cannot share a bucket with yourself' }, { status: 400 });
    }

    // ── Find the source bucket in SUPABASE ──
    let srcBucket: any = null;

    if (bucketSlug) {
      const res = await supaQuery(
        `SELECT * FROM buckets WHERE slug = $1 AND user_id = $2 AND is_active = true`,
        [bucketSlug, supaSender.id],
      );
      srcBucket = res.rows[0];
    }

    if (!srcBucket && bucketId) {
      const res = await supaQuery(
        `SELECT * FROM buckets WHERE bucket_id = $1 AND user_id = $2 AND is_active = true`,
        [bucketId, supaSender.id],
      );
      srcBucket = res.rows[0];
    }

    // Last resort: the bucket list GET can derive buckets from memories table
    // (when the buckets table is empty). In that case bucketId = slug.
    if (!srcBucket && (bucketSlug || bucketId)) {
      const slug = bucketSlug || bucketId;
      const memRes = await supaQuery(
        `SELECT COUNT(*) as cnt FROM memories
         WHERE bucket = $1 AND user_id = $2 AND is_active = true`,
        [slug, supaSender.id],
      );
      if (parseInt(memRes.rows[0]?.cnt || '0', 10) > 0) {
        srcBucket = {
          slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1),
          bucket_id: slug,
          description: null,
        };
      }
    }

    if (!srcBucket) {
      return NextResponse.json(
        { error: 'Bucket not found or you don\'t own it.' },
        { status: 400 },
      );
    }

    // ── Look up target user in SUPABASE ──
    const targetRes = await supaQuery(
      `SELECT id, email, full_name FROM users WHERE email = $1 AND is_active = true`,
      [normalizedEmail],
    );
    const supaTarget = targetRes.rows[0];

    if (!supaTarget) {
      return NextResponse.json(
        { error: 'No Memron user found with this email. They need to sign up first.' },
        { status: 404 },
      );
    }

    // ── Check target user's bucket limit ──
    const cntRes = await supaQuery(
      'SELECT COUNT(*) as c FROM buckets WHERE user_id = $1 AND is_active = true',
      [supaTarget.id],
    );
    if (parseInt(cntRes.rows[0]?.c || '0', 10) >= 50) {
      return NextResponse.json(
        { error: 'Recipient has reached their bucket limit (50)' },
        { status: 400 },
      );
    }

    // ── Generate unique slug for copied bucket ──
    const baseSlug = `shared-${srcBucket.slug}`;
    let copySlug = baseSlug;
    let attempt = 0;
    while (true) {
      const existsRes = await supaQuery(
        'SELECT 1 FROM buckets WHERE user_id = $1 AND slug = $2',
        [supaTarget.id, copySlug],
      );
      if (!existsRes.rows[0]) break;
      attempt++;
      copySlug = `${baseSlug}-${attempt}`;
      if (attempt > 20) {
        return NextResponse.json(
          { error: 'Could not generate unique slug for copied bucket' },
          { status: 400 },
        );
      }
    }

    // ── Copy bucket + memories in Supabase ──
    // 1. Create copied bucket for target user
    const copyBucketRes = await supaQuery(
      `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
       VALUES ($1, NULL, $2, $3, $4, false)
       RETURNING *`,
      [
        supaTarget.id,
        `${srcBucket.name} (shared)`,
        copySlug,
        `Shared by another user. ${srcBucket.description || ''}`.trim(),
      ],
    );
    const copiedBucket = copyBucketRes.rows[0];

    if (!copiedBucket) {
      return NextResponse.json({ error: 'Failed to create shared bucket copy' }, { status: 500 });
    }

    // 2. Copy memories
    await supaQuery(
      `INSERT INTO memories (pointer_id, user_id, org_id, bucket, title, content_encrypted,
         content_iv, content_tag, content_hash, tags, token_count, original_tokens, metadata,
         sub_path, importance)
       SELECT
         'cp' || substring(md5(random()::text) from 1 for 10),
         $1, NULL, $2, title, content_encrypted,
         content_iv, content_tag, content_hash, tags, token_count, original_tokens,
         jsonb_set(COALESCE(metadata::jsonb, '{}'), '{shared_from}', to_jsonb($3::text)),
         sub_path, importance
       FROM memories
       WHERE bucket = $4 AND user_id = $5 AND is_active = true`,
      [supaTarget.id, copySlug, srcBucket.bucket_id, srcBucket.slug, supaSender.id],
    );

    // 3. Update memory_count
    const memCntRes = await supaQuery(
      'SELECT COUNT(*) as c FROM memories WHERE bucket = $1 AND user_id = $2 AND is_active = true',
      [copySlug, supaTarget.id],
    );
    await supaQuery(
      'UPDATE buckets SET memory_count = $1 WHERE id = $2',
      [parseInt(memCntRes.rows[0]?.c || '0', 10), copiedBucket.id],
    );

    // 4. Record the share
    await supaQuery(`
      CREATE TABLE IF NOT EXISTS bucket_shares (
        id              SERIAL PRIMARY KEY,
        share_id        UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        source_bucket_id TEXT NOT NULL,
        source_user_id  INTEGER NOT NULL,
        target_user_id  INTEGER NOT NULL,
        target_email    VARCHAR(320) NOT NULL,
        copied_bucket_id TEXT,
        status          VARCHAR(20) DEFAULT 'accepted',
        message         TEXT,
        accepted_at     TIMESTAMPTZ DEFAULT NOW(),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source_bucket_id, target_email)
      )
    `).catch(() => { /* already exists */ });

    const shareRes = await supaQuery(
      `INSERT INTO bucket_shares (source_bucket_id, source_user_id, target_user_id, target_email, copied_bucket_id, status, message)
       VALUES ($1, $2, $3, $4, $5, 'accepted', $6)
       ON CONFLICT (source_bucket_id, target_email) DO UPDATE SET
         copied_bucket_id = EXCLUDED.copied_bucket_id,
         status = 'accepted',
         accepted_at = NOW()
       RETURNING *`,
      [srcBucket.bucket_id, supaSender.id, supaTarget.id, normalizedEmail,
       copiedBucket.bucket_id, message?.trim()?.slice(0, 500) ?? null],
    );
    const share = shareRes.rows[0];

    // ── Create in-app notification for recipient (Aiven — where notifications live) ──
    const senderName = aivenSender?.full_name || aivenSender?.email || supaSender.email;
    const bucketDisplayName = srcBucket.name || srcBucket.slug;

    try {
      // Get Aiven target user for notification (notifications are in Aiven)
      const aivenTarget = await (async () => {
        const { getUserByEmailFromPostgres } = await import('@/lib/postgres');
        return getUserByEmailFromPostgres(normalizedEmail);
      })();
      if (aivenTarget) {
        await createNotification({
          userId: aivenTarget.id,
          type: 'bucket_share',
          title: `${senderName} shared a bucket with you`,
          body: message?.trim() || `You received the "${bucketDisplayName}" bucket context.`,
          metadata: {
            shareId: share?.share_id,
            sourceBucketSlug: srcBucket.slug,
            copiedBucketId: copiedBucket.bucket_id,
            senderEmail: supaSender.email,
            senderName,
          },
        });
      }
    } catch {
      console.warn('[BucketShare] notification creation failed (non-fatal)');
    }

    // ── Send email notification (optional — requires RESEND_API_KEY) ──
    if (process.env.RESEND_API_KEY) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Memron <noreply@memron.ai>',
            to: [normalizedEmail],
            subject: `${senderName} shared a memory bucket with you on Memron`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#e4e4e7;background:#09090b;border-radius:12px;">
                <div style="text-align:center;margin-bottom:24px;">
                  <h2 style="color:#fafafa;font-size:18px;margin:0;">Memron</h2>
                </div>
                <p style="font-size:14px;line-height:1.6;color:#a1a1aa;">
                  <strong style="color:#fafafa;">${senderName}</strong> shared a memory bucket with you.
                </p>
                ${message ? `<p style="font-size:13px;color:#71717a;border-left:3px solid #27272a;padding-left:12px;margin:16px 0;">"${message}"</p>` : ''}
                <p style="font-size:14px;line-height:1.6;color:#a1a1aa;">
                  The bucket has been automatically added to your dashboard. Open Memron to explore the shared context.
                </p>
                <div style="text-align:center;margin-top:24px;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://memron.ai'}/dashboard"
                     style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
                    Open Dashboard
                  </a>
                </div>
                <p style="font-size:11px;color:#52525b;margin-top:24px;text-align:center;">
                  Memron — Persistent Memory for AI Agents
                </p>
              </div>
            `,
          }),
        });
        if (!resendRes.ok) {
          console.warn('[BucketShare] Email send failed:', await resendRes.text());
        }
      } catch (emailErr: any) {
        console.warn('[BucketShare] Email notification failed (non-fatal):', emailErr.message);
      }
    }

    invalidateEndpoint(authUser.uid, 'buckets');

    return NextResponse.json({
      success: true,
      share: {
        shareId: share?.share_id,
        targetEmail: normalizedEmail,
        targetName: supaTarget.full_name,
        copiedBucketId: copiedBucket.bucket_id,
        status: share?.status || 'accepted',
      },
    });
  } catch (error: any) {
    console.error('[BucketShare API] Error:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/dashboard/buckets/share — List bucket shares (sent & received)
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(authUser.uid, 'buckets', CACHE_PROFILES.buckets);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 60000) / 1000)) } },
      );
    }

    const data = await cachedQuery(
      `bucket-shares:${authUser.uid}`,
      async () => {
        const supaUser = await resolveSupabaseUser(authUser.uid);
        if (!supaUser) return { sent: [], received: [] };

    const [sentRes, receivedRes] = await Promise.all([
      supaQuery(
        `SELECT bs.*, b.name as bucket_name, b.slug as bucket_slug,
                u.email as target_user_email, u.full_name as target_user_name
         FROM bucket_shares bs
         LEFT JOIN buckets b ON b.bucket_id::text = bs.source_bucket_id
         LEFT JOIN users u ON u.id = bs.target_user_id
         WHERE bs.source_user_id = $1
         ORDER BY bs.created_at DESC`,
        [supaUser.id],
      ).catch(() => ({ rows: [] } as any)),
      supaQuery(
        `SELECT bs.*, b.name as bucket_name, b.slug as bucket_slug,
                u.email as source_user_email, u.full_name as source_user_name
         FROM bucket_shares bs
         LEFT JOIN buckets b ON b.bucket_id::text = bs.copied_bucket_id
         LEFT JOIN users u ON u.id = bs.source_user_id
         WHERE bs.target_user_id = $1
         ORDER BY bs.created_at DESC`,
        [supaUser.id],
      ).catch(() => ({ rows: [] } as any)),
    ]);

        return {
          sent: sentRes.rows.map((s: any) => ({
            shareId: s.share_id,
            bucketName: s.bucket_name,
            bucketSlug: s.bucket_slug,
            targetEmail: s.target_email,
            targetName: s.target_user_name,
            status: s.status,
            createdAt: s.created_at,
          })),
          received: receivedRes.rows.map((r: any) => ({
            shareId: r.share_id,
            bucketName: r.bucket_name,
            bucketSlug: r.bucket_slug,
            senderEmail: r.source_user_email,
            senderName: r.source_user_name,
            status: r.status,
            createdAt: r.created_at,
          })),
        };
      },
      CACHE_PROFILES.buckets,
    );

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[BucketShare API] List error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
