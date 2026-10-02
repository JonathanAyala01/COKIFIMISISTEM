import { ConsultorioData, DeclarationData } from './types';

const getSettings = () => window.cokifimiSettings || {};

const READ_REQUEST_TIMEOUT_MS = 30000;
const WRITE_REQUEST_TIMEOUT_MS = 90000;

const getSafeApiErrorMessage = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/<(?:html|body|p|a)[\s>]/i.test(text) || /error cr[ií]tico de wordpress|critical error/i.test(text)) {
    return 'No se pudo buscar o actualizar el profesional. Verifique el ID, DNI o matrícula e intente nuevamente.';
  }
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const request = async (path: string, options: RequestInit = {}) => {
  const settings = getSettings();
  if (!settings.apiBase) {
    throw new Error('La API de registros no está configurada.');
  }

  let apiBase = String(settings.apiBase || '');
  apiBase = apiBase.replace(/^['"]+|['"]+$/g, '');
  apiBase = apiBase.replace(/\/+$/g, '');
  const cleanPath = String(path || '').replace(/^\/+/, '');

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (!options.method) {
    headers.set('Cache-Control', 'no-cache, no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
  }
  if (settings.isAdmin && settings.nonce) headers.set('X-WP-Nonce', settings.nonce);

  const controller = new AbortController();
  const timeoutMs = options.method ? WRITE_REQUEST_TIMEOUT_MS : READ_REQUEST_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const url = `${apiBase}/${cleanPath}`;
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal, credentials: 'include', cache: options.method ? undefined : 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message || 'No se pudo completar la operación.');
    }
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('La solicitud demoró demasiado. Intente nuevamente.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};
export const getCurrentMode = (override?: string) => String(override || getSettings().mode || 'public');
export const isServerConfigured = () => Boolean(getSettings().apiBase);
export const getServerDate = async () => {
  const response = await request('/server-time?_cokifimi=' + Date.now()) as { date?: string };
  return String(response.date || '').slice(0, 10);
};
export const isAdminMode = (override?: string) => Boolean(getSettings().isAdmin || getCurrentMode(override) === 'portal');
export const isPortalMode = (override?: string) => getCurrentMode(override) === 'portal';
export const isMemberMode = (override?: string) => ['member', 'member-register', 'member-no-token'].includes(getCurrentMode(override));
export const getMemberPortalVariant = (override?: string) => {
  const mode = getCurrentMode(override);
  if (mode === 'member-no-token') return 'register';
  if (mode === 'member-register') return 'login';
  return 'standard';
};

export const loadServerRecords = async () => {
  const response = await request('/records?_cokifimi=' + Date.now());
  return Array.isArray(response) ? response as DeclarationData[] : [];
};

export const lookupServerRecord = (value: string) => request(
  `/records/lookup?value=${encodeURIComponent(value)}`,
) as Promise<DeclarationData>;

export const loadServerRecord = (id: string) => request(`/records/${encodeURIComponent(id)}?_cokifimi=${Date.now()}`) as Promise<DeclarationData>;
export const loadServerRecordPhoto = async (id: string) => {
  const response = await request(`/records/${encodeURIComponent(id)}/photo`) as { fotoUrl?: string };
  return String(response?.fotoUrl || "");
};

export const saveServerRecord = (data: DeclarationData) => request(
  isAdminMode() ? `/records/${encodeURIComponent(data.id)}` : '/records',
  { method: isAdminMode() ? 'PUT' : 'POST', body: JSON.stringify(data) },
) as Promise<DeclarationData>;

export const updateConsultorioServer = (data: DeclarationData) => request('/consultorio/update', {
  method: 'POST',
  body: JSON.stringify({ recordId: data.id, consultorioSolicitudId: data.consultorioSolicitudId, formularioHabilitacionConsultorio: data.formularioHabilitacionConsultorio }),
}) as Promise<DeclarationData>;
export const deleteServerRecord = (id: string) => request(`/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const deleteConsultorioServer = (id: string, solicitudId?: string, domicilio?: string) => { const params = new URLSearchParams(); if (solicitudId) params.set("solicitudId", solicitudId); if (domicilio) params.set("domicilio", domicilio); const query = params.toString(); return request(`/records/${encodeURIComponent(id)}/consultorio${query ? `?${query}` : ""}`, { method: 'DELETE' }) as Promise<DeclarationData>; };
export const deleteLibreDeudaRequest = (id: string) => request(`/records/${encodeURIComponent(id)}/libre-deuda`, { method: "DELETE" }) as Promise<DeclarationData>;
export const deleteAllConsultoriosServer = () => request('/consultorio/delete-all', { method: 'POST' }) as Promise<{ deleted: number }>;

export const portalLogin = (username: string, password: string) => request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password }),
});

export const portalLogout = () => request('/auth/logout', { method: 'POST' });

export const memberRequestCode = (dni: string, email: string) => request('/member/request-code', {
  method: 'POST', body: JSON.stringify({ dni, email }),
});

export const memberVerify = (dni: string, email: string, code: string, accessToken: string) => request('/member/verify', {
  method: 'POST', body: JSON.stringify({ dni, email, code, accessToken }),
}) as Promise<{ authenticated: boolean; record: DeclarationData | null }>;

export const memberLogin = (dni: string, accessToken: string) => request('/member/login', {
  method: 'POST', body: JSON.stringify({ dni, accessToken }),
}) as Promise<{ authenticated: boolean; record: DeclarationData | null }>;

// Evita que WordPress, un proxy o el navegador entregue una sesión anterior cuando Administración acaba de confirmar el importe.
export const memberMe = () => request(`/member/me?_cokifimi=${Date.now()}`) as Promise<DeclarationData | { record: DeclarationData | null }>;
export const memberSaveRecord = async (data: DeclarationData) => {
  const body = JSON.stringify(data);
  const routeError = (error: unknown) =>
    error instanceof Error &&
    /rest_no_route|no se ha encontrado ninguna ruta|solicitud de alta no encontrada/i.test(error.message);
  try {
    return await request('/member/record', { method: 'PUT', body }) as Promise<DeclarationData>;
  } catch (putError) {
    if (!routeError(putError)) throw putError;
    try {
      return await request('/member/record', { method: 'POST', body }) as Promise<DeclarationData>;
    } catch (postError) {
      if (!routeError(postError)) throw postError;
      return await request('/consultorio/update', {
        method: 'POST',
        body: JSON.stringify({
          recordId: data.id,
          consultorioSolicitudId: data.consultorioSolicitudId,
          formularioHabilitacionConsultorio: data.formularioHabilitacionConsultorio,
        }),
      }) as Promise<DeclarationData>;
    }
  }
};
export const memberAddConsultorio = (consultorio: ConsultorioData) => request('/member/consultorios', {
  method: 'POST', body: JSON.stringify({ consultorio }),
}) as Promise<DeclarationData>;
export const memberManageAttached = (action: 'associate' | 'remove', matricula: string, consultorioSolicitudId?: string) => request('/member/attached-professionals', {
  method: 'POST', body: JSON.stringify({ action, matricula, consultorioSolicitudId }),
}) as Promise<DeclarationData>;
export const memberLogout = () => request('/member/logout', { method: 'POST' });
export const notifyConsultorioResolution = (recordId: string, approved: boolean, message: string, consultorioSolicitudId?: string) => request('/consultorio/notify-resolution', {
  method: 'POST', body: JSON.stringify({ recordId, approved, message, consultorioSolicitudId }),
});
export const notifyLibreDeudaResolution = (recordId: string, approved: boolean, message: string) => request('/libre-deuda/notify-resolution', {
  method: 'POST', body: JSON.stringify({ recordId, approved, message }),
});
export const notifyConsultorioAmount = (recordId: string, consultorioSolicitudId?: string) => request('/consultorio/notify-amount', {
  method: 'POST', body: JSON.stringify({ recordId, consultorioSolicitudId }),
});
export const syncLegacyMemberAccount = (dni: string) => request('/member/sync-legacy-account', {
  method: 'POST', body: JSON.stringify({ dni }),
}) as Promise<DeclarationData>;
export const deleteMemberAccount = (dni: string) => request('/member/delete-account', {
  method: 'POST', body: JSON.stringify({ dni }),
});
