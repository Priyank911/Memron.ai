import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';

/**
 * GET /api/dashboard/prompts — List prompt templates and versions
 * POST /api/dashboard/prompts — Create/update template or version, or activate version
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const supaUser = await resolveSupabaseUser(authUser.uid, orgId);
    if (!supaUser) return NextResponse.json({ templates: [] });

    const { id: uid, orgId: userOrgId } = supaUser;
    const { where: whereUser, params } = buildUserWhereClause(uid, userOrgId);

    try {
      const tplResult = await supaQuery(
        `SELECT id, template_id, name, description, active_version_id, created_at, updated_at
         FROM prompt_templates
         WHERE (${whereUser})
         ORDER BY updated_at DESC`,
        params
      );

      const templates = await Promise.all(
        tplResult.rows.map(async (t: any) => {
          const verResult = await supaQuery(
            `SELECT id, version_id, version_number, prompt_text, changelog, created_at
             FROM prompt_versions
             WHERE prompt_template_id = $1
             ORDER BY version_number DESC`,
            [t.template_id]
          );

          return {
            id: t.template_id,
            name: t.name,
            description: t.description,
            activeVersionId: t.active_version_id,
            createdAt: t.created_at,
            updatedAt: t.updated_at,
            versions: verResult.rows.map((v: any) => ({
              id: v.version_id,
              versionNumber: v.version_number,
              promptText: v.prompt_text,
              changelog: v.changelog,
              createdAt: v.created_at,
              isActive: v.version_id === t.active_version_id,
            })),
          };
        })
      );

      return NextResponse.json({ templates });
    } catch {
      return NextResponse.json({ templates: [] });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Prompts GET] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const supaUser = await resolveSupabaseUser(authUser.uid, orgId);
    if (!supaUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { action, templateId, versionId, name, description, promptText, changelog } = body;

    const { id: uid, orgId: userOrgId } = supaUser;

    if (action === 'create_template') {
      const newTplId = `tpl_${Date.now().toString(36)}`;
      const newVerId = `ver_${Date.now().toString(36)}_v1`;

      await supaQuery(
        `INSERT INTO prompt_templates (template_id, user_id, org_id, name, description, active_version_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newTplId, uid, userOrgId || null, name || 'New System Prompt', description || '', newVerId]
      );

      await supaQuery(
        `INSERT INTO prompt_versions (version_id, prompt_template_id, user_id, version_number, prompt_text, changelog)
         VALUES ($1, $2, $3, 1, $4, $5)`,
        [newVerId, newTplId, uid, promptText || 'You are a sovereign AI assistant powered by Memron.', changelog || 'Initial release']
      );

      return NextResponse.json({ success: true, templateId: newTplId, versionId: newVerId });
    }

    if (action === 'create_version' || action === 'add_version') {
      if (!templateId || !promptText) {
        return NextResponse.json({ error: 'templateId and promptText required' }, { status: 400 });
      }

      const templateRes = await supaQuery(
        `SELECT template_id FROM prompt_templates WHERE template_id = $1 AND user_id = $2 LIMIT 1`,
        [templateId, uid]
      );
      if (templateRes.rows.length === 0) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

      const countRes = await supaQuery(
        `SELECT COUNT(*) as count FROM prompt_versions WHERE prompt_template_id = $1 AND user_id = $2`,
        [templateId, uid]
      );
      const nextVerNum = parseInt(countRes.rows[0].count || '0', 10) + 1;
      const newVerId = `ver_${Date.now().toString(36)}_v${nextVerNum}`;

      await supaQuery(
        `INSERT INTO prompt_versions (version_id, prompt_template_id, user_id, version_number, prompt_text, changelog)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newVerId, templateId, uid, nextVerNum, promptText, changelog || `Version ${nextVerNum}`]
      );

      return NextResponse.json({ success: true, templateId, versionId: newVerId, versionNumber: nextVerNum });
    }

    if (action === 'activate_version') {
      if (!templateId || !versionId) {
        return NextResponse.json({ error: 'templateId and versionId required' }, { status: 400 });
      }

      const versionRes = await supaQuery(
        `SELECT version_id FROM prompt_versions WHERE version_id = $1 AND prompt_template_id = $2 AND user_id = $3 LIMIT 1`,
        [versionId, templateId, uid]
      );
      if (versionRes.rows.length === 0) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

      await supaQuery(
        `UPDATE prompt_templates SET active_version_id = $1, updated_at = NOW() WHERE template_id = $2 AND user_id = $3`,
        [versionId, templateId, uid]
      );

      return NextResponse.json({ success: true, templateId, activeVersionId: versionId });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Prompts POST] Error:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
