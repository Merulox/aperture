import type { APIRoute } from 'astro';
import { getRedTeamDashboard, setActiveWorkspace } from '../../lib/red-team';

const NO_STORE = { 'cache-control': 'no-store' };

export const GET: APIRoute = async () => {
  try {
    return Response.json(await getRedTeamDashboard(), { headers: NO_STORE });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500, headers: NO_STORE });
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400, headers: NO_STORE });
  }

  try {
    if (body.action !== 'workspace') {
      return Response.json({ ok: false, error: 'only active-workspace selection is mutable; mission progress is derived from artifacts' }, { status: 400, headers: NO_STORE });
    }
    if (typeof body.workspaceId !== 'string') {
      return Response.json({ ok: false, error: 'workspace requires workspaceId' }, { status: 400, headers: NO_STORE });
    }
    await setActiveWorkspace(body.workspaceId);

    return Response.json({ ok: true, dashboard: await getRedTeamDashboard() }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expected = message === 'unknown workspace';
    return Response.json({ ok: false, error: message }, { status: expected ? 409 : 500, headers: NO_STORE });
  }
};
