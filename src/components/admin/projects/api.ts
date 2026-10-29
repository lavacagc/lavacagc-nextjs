/**
 * Browser calls to /api/admin/projects/*. Every write in the project flow goes
 * through these (service key on the server), never straight to the tables.
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly issues?: Array<{ path: string; message: string }>) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: unknown = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; issues?: Array<{ path: string; message: string }> };
    const detail = body.issues?.map((i) => i.message).join(' ') ?? '';
    throw new ApiError(res.status, [body.error, detail].filter(Boolean).join(': ') || `Request failed (${res.status})`, body.issues);
  }
  return data as T;
}

export interface SavedProject {
  id: string;
  url_slug: string;
  status: 'draft' | 'published' | 'archived';
  admin_url: string;
}

export const projectsApi = {
  list: () => api<{ projects: unknown[] }>('/api/admin/projects'),
  get: (id: string) => api<{ project: Record<string, unknown> }>(`/api/admin/projects/${id}`),
  create: (body: unknown) => api<SavedProject>('/api/admin/projects', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: unknown) => api<SavedProject>(`/api/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => api<{ status: string }>(`/api/admin/projects/${id}`, { method: 'DELETE' }),
  publish: (id: string, feature = false) =>
    api<SavedProject>(`/api/admin/projects/${id}/publish`, { method: 'POST', body: JSON.stringify(feature ? { feature: true } : {}) }),
  unpublish: (id: string) => api<SavedProject>(`/api/admin/projects/${id}/unpublish`, { method: 'POST' }),
  draftPhotos: () => api<{ photos: DraftPhoto[] }>('/api/admin/projects/draft-photos'),
};

export interface DraftPhoto {
  name: string;
  path: string;
  url: string;
  size: number | null;
  created_at: string | null;
  content_type: string | null;
  in_use: boolean;
}
