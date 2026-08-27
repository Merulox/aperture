import type { APIRoute } from 'astro';
import { getRepositoryWorkflows, getWorkflowBranch, getWorkflowRoot } from '../../lib/workflows';

const BRANCHES: Record<string, true> = {
  residents: true,
  sessions: true,
  services: true,
  capabilities: true,
  model: true,
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const repo = url.searchParams.get('repo');
    const branch = url.searchParams.get('branch');
    let graph;
    if (repo) {
      graph = await getRepositoryWorkflows(repo);
    } else if (branch) {
      if (!(branch in BRANCHES)) {
        return Response.json({ error: `Unknown workflow branch: ${branch}` }, { status: 400 });
      }
      graph = await getWorkflowBranch(branch);
    } else {
      graph = await getWorkflowRoot();
    }
    return Response.json(graph, { headers: { 'cache-control': 'no-store' } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return Response.json({ error: message }, {
      status: message.startsWith('Unknown ') ? 404 : 500,
      headers: { 'cache-control': 'no-store' },
    });
  }
};
