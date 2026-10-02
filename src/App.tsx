import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Award, CheckCircle, LoaderCircle, RotateCcw, Search } from 'lucide-react';
import { ConsultorioData, DeclarationData, INITIAL_DECLARATION } from './types';
import CoKiFiMiLogo from './components/CoKiFiMiLogo';
import FormWizard from './components/FormWizard';
import DeclarationPreview from './components/DeclarationPreview';
import DeclarationDashboard from './components/DeclarationDashboard';
import PortalLogin from './components/PortalLogin';
import MemberPortal from './components/MemberPortal';
import { deleteAllConsultoriosServer, deleteConsultorioServer, deleteServerRecord, getCurrentMode, getMemberPortalVariant, isAdminMode, isMemberMode, isPortalMode, isServerConfigured, loadServerRecords, loadServerRecord, lookupServerRecord, portalLogout, saveServerRecord, updateConsultorioServer, } from './api';

const getPhotoStorageKey = (id: string) => `cokifimi_declaration_photo_${id}`;

const safeSetLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // La copia local es solo una caché; nunca debe interrumpir el guardado principal.
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, value);
        return;
      } catch {
        // Si el navegador sigue sin espacio, se conserva el registro en el servidor.
      }
    }
    // La caché local puede quedar sin cuota; el servidor sigue siendo la fuente principal.
  }
};

const normalizeDeclaration = (declaration: DeclarationData): DeclarationData => {
  const storedPresentation = declaration.fechaPresentacion || (declaration.createdAt ? declaration.createdAt.slice(0, 10) : '');
  const storedExpiry = declaration.fechaVencimiento || (storedPresentation ? (() => { const date = new Date(`${storedPresentation}T00:00:00`); date.setFullYear(date.getFullYear() + 2); return date.toISOString().slice(0, 10); })() : '');
  const legacyConsultorio = {
    domicilio: declaration.domicilioConsultorio || '',
    numeracion: declaration.numeracionConsultorio || '',
    ciudad: declaration.ciudadConsultorio || '',
    esTitularConsultorio: declaration.esTitularConsultorio || 'NO',
    esProfesionalAdjunto: declaration.esProfesionalAdjunto || 'NO',
    nombreTitularConsultorio: declaration.nombreTitularConsultorio || '',
    fechaInicioConsultorio: declaration.fechaInicioConsultorio || '',
    numeroMatriculaConsultorio: declaration.numeroMatriculaConsultorio || '',
  };
  const consultorios = declaration.trabajaConsultorio !== "SI"
    ? []
    : declaration.consultorios?.length
      ? declaration.consultorios.map((consultorio, index) => (
      index === 0 ? { ...legacyConsultorio, ...consultorio } : consultorio
    ))
    : declaration.trabajaConsultorio === 'SI' && (declaration.domicilioConsultorio || declaration.numeracionConsultorio || declaration.ciudadConsultorio)
      ? [legacyConsultorio]
      : [];
  const cantidadConsultorios = Math.min(4, Math.max(1, declaration.cantidadConsultorios || 0, consultorios.length || 0)) as 1 | 2 | 3 | 4;
  const normalizedConsultorios = consultorios.map((consultorio) =>
    ["SI", "SÍ"].includes(String(consultorio.esTitularConsultorio || "").toUpperCase())
      ? { ...consultorio, esTitularConsultorio: "SI" as const, esProfesionalAdjunto: "NO" as const }
      : consultorio,
  );

  const isProvisional = declaration.memberProvisional === true;

  return {
    ...INITIAL_DECLARATION,
    ...declaration,
    ...(isProvisional ? { apellido: '', nombres: '' } : {}),
    memberEnabled: declaration.memberEnabled !== false,
    // All records, including legacy entries, render with the current A4
    // template. The version is persisted the next time an admin edits it.
    printLayoutVersion: 2,
    // A matriculation date is valid only when explicitly entered from admin.
    // Older records may contain an automatic/legacy value, so keep those blank.
    // Preserve dates already stored in legacy declarations so they remain
    // visible in the member card and in the two-page preview.
    fechaMatriculacion: declaration.fechaMatriculacion || '',
    fechaPresentacion: storedPresentation,
    fechaVencimiento: storedExpiry,
    numeracionDomicilioActual: declaration.numeracionDomicilioActual || '',
    pisoDomicilioActual: declaration.pisoDomicilioActual || '',
    consultorios: normalizedConsultorios as ConsultorioData[],
    cantidadConsultorios,
    actividadPublica: ['SI', 'NO', 'AMBAS'].includes(declaration.actividadPublica) ? declaration.actividadPublica as 'SI' | 'NO' | 'AMBAS' : 'NO',
    trabajaConsultorio: ['SI', 'NO', 'SOLO_DOMICILIO'].includes(declaration.trabajaConsultorio) ? declaration.trabajaConsultorio as 'SI' | 'NO' | 'SOLO_DOMICILIO' : 'NO',
  };
};

const synchronizeAltaConsultorioAddresses = (previous: DeclarationData | undefined, next: DeclarationData): DeclarationData => {
  if (!previous || !next.consultorios?.length) return next;
  const oldConsultorios = previous.consultorios || [];
  const newConsultorios = next.consultorios || [];
  const normalizeAddress = (value: unknown) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const addressOf = (form: Record<string, unknown> | undefined) => normalizeAddress(
    `${form?.domicilioConsultorio || ''} ${form?.numeroConsultorio || form?.numeracion || ''} ${form?.localidadConsultorio || form?.ciudad || ''}`,
  );
  const consultorioAddress = (consultorio: NonNullable<DeclarationData['consultorios']>[number]) => normalizeAddress(
    `${consultorio.domicilio || ''} ${consultorio.numeracion || ''} ${consultorio.ciudad || ''}`,
  );
  const syncForm = (form: Record<string, string | boolean | undefined> | undefined) => {
    if (!form) return form;
    const oldAddress = addressOf(form);
    const oldIndex = oldConsultorios.findIndex((consultorio) => consultorioAddress(consultorio) === oldAddress);
    if (oldIndex < 0) return form;
    const updatedConsultorio = newConsultorios[oldIndex];
    if (!updatedConsultorio) return form;
    return {
      ...form,
      domicilioConsultorio: updatedConsultorio.domicilio || '',
      numeroConsultorio: updatedConsultorio.numeracion || '',
      localidadConsultorio: updatedConsultorio.ciudad || '',
    };
  };
  return {
    ...next,
    formularioHabilitacionConsultorio: syncForm(next.formularioHabilitacionConsultorio),
    consultorioSolicitudes: next.consultorioSolicitudes?.map((request) => {
      const requestId = request.id || String(request.formularioHabilitacionConsultorio?.consultorioSolicitudId || "").trim();
      const form = syncForm(request.formularioHabilitacionConsultorio);
      return {
        ...request,
        ...(requestId ? { id: requestId } : {}),
        formularioHabilitacionConsultorio: requestId ? { ...form, consultorioSolicitudId: requestId } : form,
      };
    }),
  };
};
const withoutPhoto = (declaration: DeclarationData): DeclarationData => {
  return { ...declaration, fotoUrl: '' };
};

const withoutBinaryAttachments = (declaration: DeclarationData): DeclarationData => {
  const compactForm = (form: Record<string, unknown> | undefined) => form
    ? Object.fromEntries(Object.entries(form).filter(([, value]) => !(typeof value === "string" && value.startsWith("data:"))))
    : form;
  const consultorioRequests = declaration.consultorioSolicitudes?.map((request) => ({
    ...request,
    formularioHabilitacionConsultorio: compactForm(request.formularioHabilitacionConsultorio),
  }));
  const compactDeclaration = Object.fromEntries(Object.entries(declaration).filter(([, value]) => !(typeof value === "string" && value.startsWith("data:"))));

  return {
    ...compactDeclaration,
    fotoUrl: "",
    formularioHabilitacionConsultorio: compactForm(declaration.formularioHabilitacionConsultorio),
    consultorioSolicitudes: consultorioRequests,
  };
};
const withStoredPhoto = (declaration: DeclarationData): DeclarationData => ({
  ...declaration,
  fotoUrl: localStorage.getItem(getPhotoStorageKey(declaration.id)) || declaration.fotoUrl || '',
});

const PORTAL_SESSION_STORAGE_KEY = 'cokifimi_admin_session_expires_at';
const PORTAL_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const hasActivePortalSession = () => {
  const expiresAt = Number(localStorage.getItem(PORTAL_SESSION_STORAGE_KEY) || 0);
  if (!expiresAt || expiresAt <= Date.now()) {
    localStorage.removeItem(PORTAL_SESSION_STORAGE_KEY);
    return false;
  }
  return true;
};

const persistPortalSession = () => {
  localStorage.setItem(PORTAL_SESSION_STORAGE_KEY, String(Date.now() + PORTAL_SESSION_DURATION_MS));
};

const clearPortalSession = () => {
  localStorage.removeItem(PORTAL_SESSION_STORAGE_KEY);
};
const isServerPermissionError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('401') ||
    message.includes('403') ||
    message.includes('no tiene permiso') ||
    message.includes('no está autenticado') ||
    message.includes('autoriz');
};

type AppProps = {
  mode?: 'public' | 'wp-admin' | 'portal' | 'member' | 'member-register' | 'member-no-token';
};

export default function App({ mode }: AppProps) {
  const currentMode = getCurrentMode(mode);

  if (isMemberMode(currentMode)) return <MemberPortal variant={getMemberPortalVariant(currentMode)} />;

  const [screen, setScreen] = useState<'dashboard' | 'form' | 'preview' | 'portal-login'>(isPortalMode() ? (hasActivePortalSession() ? 'dashboard' : 'portal-login') : (isAdminMode() ? 'dashboard' : 'form'));
  const [declarations, setDeclarations] = useState<DeclarationData[]>([]);
  const [hiddenConsultorioRequestKeys, setHiddenConsultorioRequestKeys] = useState<string[]>([]);
  const [currentDeclaration, setCurrentDeclaration] = useState<DeclarationData>({ ...INITIAL_DECLARATION, fechaPresentacion: '', fechaVencimiento: '' });
  const [resetKey, setResetKey] = useState(0);
  const [portalAuthenticated, setPortalAuthenticated] = useState(() => isPortalMode() && hasActivePortalSession());
  // Evita que una recarga automática antigua pise un cambio recién confirmado por Administración.
  const adminRefreshVersionRef = useRef(0);
  const adminRefreshPausedUntilRef = useRef(0);
  const [isEditingDeclaration, setIsEditingDeclaration] = useState(false);
  const [isRenewingDeclaration, setIsRenewingDeclaration] = useState(false);
  const [duplicateDniRecord, setDuplicateDniRecord] = useState<DeclarationData | null>(null);
  const [searchDni, setSearchDni] = useState('');
  const [isReadOnlyPreview, setIsReadOnlyPreview] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchedDeclaration, setSearchedDeclaration] = useState<DeclarationData | null>(null);
  const [saveSuccessDeclaration, setSaveSuccessDeclaration] = useState<DeclarationData | null>(null);
  const [saveSuccessMode, setSaveSuccessMode] = useState<'created' | 'updated'>('created');
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'updated'>('idle');
  const [highlightedDeclarationId, setHighlightedDeclarationId] = useState<string | null>(null);
  const [pendingDeclaration, setPendingDeclaration] = useState<DeclarationData | null>(null);

  useEffect(() => {
    if (saveFeedback !== 'updated') return;
    const timer = window.setTimeout(() => {
      setSaveSuccessDeclaration(null);
      setSaveFeedback('idle');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  useEffect(() => {
    if (isPortalMode() && !portalAuthenticated) return;

    document.body.classList.add('cokifimi-dj-active');

    return () => {
      document.body.classList.remove('cokifimi-dj-active');
    };
  }, []);

  useEffect(() => {
    if (screen === 'preview' && pendingDeclaration) {
      window.setTimeout(() => {
        document.getElementById('btn-confirm-save')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, pendingDeclaration]);

  useEffect(() => {
    if (isPortalMode() && !portalAuthenticated) return;

    // 1. Load multi-declaration list
    const storedList = localStorage.getItem('cokifimi_declarations');
    let loadedList: DeclarationData[] = [];
    if (storedList) {
      try {
        loadedList = JSON.parse(storedList).map(normalizeDeclaration);
      } catch (error) {
        console.error('Error loading declarations list from storage', error);
      }
    }

    // Drafts are intentionally not restored: records are persisted only on submit.
    localStorage.removeItem('cokifimi_current_draft');

    const compactDeclarations = loadedList.map((declaration) => {
      if (declaration.fotoUrl) {
        safeSetLocalStorage(getPhotoStorageKey(declaration.id), declaration.fotoUrl);
      }
      return withoutBinaryAttachments(withoutPhoto(declaration));
    });
    // Compactar también los adjuntos Base64 antiguos al iniciar para liberar cuota.
    safeSetLocalStorage('cokifimi_declarations', JSON.stringify(compactDeclarations));

    setDeclarations(compactDeclarations);

    if ((isAdminMode() || isPortalMode()) && isServerConfigured()) {
      loadServerRecords()
        .then((serverRecords) => {
          const normalizedServerRecords = serverRecords.map(normalizeDeclaration);
          // Próxima entrada al panel: se muestra esta copia completa de inmediato y luego se sincroniza.
          safeSetLocalStorage('cokifimi_declarations', JSON.stringify(normalizedServerRecords.map(withoutBinaryAttachments)));
          setDeclarations(normalizedServerRecords);
          if (normalizedServerRecords.length > 0) setCurrentDeclaration(withStoredPhoto(normalizedServerRecords[0]));
        })
        .catch((error) => {
          if (isServerPermissionError(error)) {
            if (isPortalMode()) {
              clearPortalSession();
              setPortalAuthenticated(false);
              setScreen('portal-login');
            }
            console.warn('La lectura de registros del servidor quedó bloqueada por permisos; se conserva la copia local.', error);
            return;
          }
          console.error('Error cargando registros del servidor', error);
        });
    }

    // 4. Default current declaration selection
    if (compactDeclarations.length > 0) {
      setCurrentDeclaration(withStoredPhoto(compactDeclarations[0]));
    } else {
      setCurrentDeclaration({ ...INITIAL_DECLARATION, id: `dec_${Date.now()}` });
    }
  }, [portalAuthenticated]);

  useEffect(() => {

    if (isPortalMode() && !portalAuthenticated) return;

    if (screen !== 'dashboard' || !(isAdminMode() || isPortalMode()) || !isServerConfigured()) return;

    let active = true;
    let refreshInFlight = false;
    const refreshAdminRecords = () => {
      if (Date.now() < adminRefreshPausedUntilRef.current) return;
      const refreshVersion = adminRefreshVersionRef.current;
      if (refreshInFlight) return;
      refreshInFlight = true;
      loadServerRecords()
        .then(serverRecords => {
          if (!active || refreshVersion !== adminRefreshVersionRef.current) return;
          const filteredServerRecords = serverRecords
            .map(normalizeDeclaration)
            .map((record) => {
              const hiddenRequests = hiddenConsultorioRequestKeys.filter((key) => key.startsWith(`${record.id}:`));
              if (hiddenRequests.length === 0) return record;
              const filteredRequests = (record.consultorioSolicitudes || []).filter((request) => !hiddenRequests.includes(`${record.id}:${request.id}`));
              const hasHiddenPrincipal = hiddenRequests.includes(`${record.id}:principal`);
              return {
                ...record,
                formularioHabilitacionConsultorio: hasHiddenPrincipal ? undefined : record.formularioHabilitacionConsultorio,
                consultorioSolicitudes: filteredRequests,
              };
            })
            .filter((record) => {
              const isHiddenByPrincipal = hiddenConsultorioRequestKeys.includes(`${record.id}:principal`);
              const remainingRequests = record.consultorioSolicitudes || [];
              if (isHiddenByPrincipal) return remainingRequests.length > 0;
              return !record.formularioHabilitacionConsultorio || remainingRequests.length > 0 || !hiddenConsultorioRequestKeys.some((key) => key.startsWith(`${record.id}:`));
            });
          setDeclarations(filteredServerRecords);
        })
        .catch(error => console.error('Error actualizando registros del administrador', error))
        .finally(() => { refreshInFlight = false; });
    };

    refreshAdminRecords();
    const refreshInterval = window.setInterval(refreshAdminRecords, 3000);
    window.addEventListener('focus', refreshAdminRecords);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshAdminRecords);
    };
  }, [screen, portalAuthenticated, hiddenConsultorioRequestKeys]);

  const handlePortalLogin = () => {
    persistPortalSession();
    setPortalAuthenticated(true);
    setScreen('dashboard');
  };

  const handlePortalLogout = async () => {
    clearPortalSession();
    try {
      await portalLogout();
    } finally {
      setPortalAuthenticated(false);
      setScreen('portal-login');
    }
  };

  const clearSaveSuccessOverlay = () => {
    setSaveSuccessDeclaration(null);
    setSaveFeedback('idle');
  };

  const handleSaveFromWizard = async (savedData: DeclarationData) => {
    if (!String(savedData.fotoUrl || "").trim()) {
      setSaveFeedback("idle");
      window.alert("Debe cargar la fotografía del colegiado antes de guardar.");
      return;
    }
    const wasEditing = isEditingDeclaration;
    let declarationsForValidation = declarations;
    if (isAdminMode() && isServerConfigured()) {
      try {
        declarationsForValidation = (await loadServerRecords()).map(normalizeDeclaration);
        setDeclarations(declarationsForValidation);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'No se pudieron verificar los registros existentes.');
        return;
      }
    }

    const normalizedDni = savedData.dni.replace(/\D/g, '');
    let registeredDeclaration: DeclarationData | undefined;
    if (isServerConfigured() && normalizedDni) {
      try {
        registeredDeclaration = await lookupServerRecord(savedData.dni);
      } catch {
        registeredDeclaration = undefined;
      }
    } else {
      registeredDeclaration = declarationsForValidation.find(declaration =>
        declaration.id !== savedData.id && declaration.dni.replace(/\D/g, '') === normalizedDni,
      );
    }

    if (!isEditingDeclaration && !isRenewingDeclaration && normalizedDni && registeredDeclaration) {
      setDuplicateDniRecord(registeredDeclaration);
      return;
    }

    // When editing, the photo input may be untouched and arrive empty. Keep
    // the existing portrait so an update never overwrites it with blank data.
    const existingRecord = declarations.find(declaration => declaration.id === savedData.id);
    const existingPhoto = existingRecord ? withStoredPhoto(existingRecord).fotoUrl : '';
    const preservedPhoto = savedData.fotoUrl ||
      (currentDeclaration.id === savedData.id ? currentDeclaration.fotoUrl : '') ||
      existingPhoto ||
      localStorage.getItem(getPhotoStorageKey(savedData.id)) ||
      '';

    const nowStr = new Date().toISOString();
    const administrativeSave = isAdminMode() || isPortalMode();
    const savedDataWithSynchronizedAddresses = synchronizeAltaConsultorioAddresses(existingRecord, savedData);

    const preparedData = {
      ...savedDataWithSynchronizedAddresses,
      printLayoutVersion: 2 as const,
      fechaMatriculacion: administrativeSave ? savedData.fechaMatriculacion : '',
      fechaMatriculacionAdmin: administrativeSave && Boolean(savedData.fechaMatriculacion),
      fotoUrl: preservedPhoto,
      createdAt: savedData.createdAt || nowStr,
      updatedAt: nowStr
    };

    let dataToStore = preparedData;
    if (isServerConfigured()) {
      try {
        dataToStore = await saveServerRecord(preparedData);
      } catch (error) {
        console.error('Error guardando registro en el servidor', error);
        if (isServerPermissionError(error)) {
          console.warn('La sincronización con la base de datos quedó bloqueada por permisos; se conserva el guardado local.', error);
          dataToStore = preparedData;
        } else if (isAdminMode()) {
          setSaveFeedback('idle');
          window.alert(error instanceof Error ? error.message : 'No se pudo guardar el registro.');
          return;
        } else {
          window.alert('El registro se guardó localmente, pero no pudo sincronizarse con la base de datos.');
        }
      }
    }

    if (dataToStore.fotoUrl) {
      safeSetLocalStorage(getPhotoStorageKey(dataToStore.id), dataToStore.fotoUrl);
    } else {
      localStorage.removeItem(getPhotoStorageKey(dataToStore.id));
    }

    const declarationToStore = withoutPhoto(dataToStore);
    let updatedList;
    const exists = declarations.some(dec => dec.id === dataToStore.id);
    if (exists) {
      updatedList = declarations.map(dec => dec.id === declarationToStore.id ? declarationToStore : dec);
    } else {
      updatedList = [declarationToStore, ...declarations];
    }
    
    setDeclarations(updatedList);
    safeSetLocalStorage('cokifimi_declarations', JSON.stringify(updatedList.map(withoutBinaryAttachments)));
    
    setCurrentDeclaration(dataToStore);
    setIsReadOnlyPreview(!isAdminMode() && !isPortalMode());
    setPendingDeclaration(null);
    setSaveSuccessMode(wasEditing ? 'updated' : 'created');
    setSaveSuccessDeclaration(dataToStore);
    setSaveFeedback(wasEditing && isAdminMode() ? 'updated' : 'idle');
    setIsEditingDeclaration(false);
    setIsRenewingDeclaration(false);
    localStorage.removeItem('cokifimi_current_draft');
    
    if (wasEditing && isAdminMode()) {
      setHighlightedDeclarationId(dataToStore.id);
      setScreen('dashboard');
      window.setTimeout(() => setHighlightedDeclarationId(null), 4500);
    } else {
      setScreen('preview');
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 0);
    }
  };

  const handleReviewFromWizard = (data: DeclarationData) => {
    if (!String(data.fotoUrl || "").trim()) {
      window.alert("Debe cargar la fotografía del colegiado antes de previsualizar.");
      return;
    }
    clearSaveSuccessOverlay();
    const reviewData = isAdminMode() || isPortalMode()
      ? data
      : { ...data, fechaMatriculacion: '', fechaMatriculacionAdmin: false };
    setCurrentDeclaration(reviewData);
    setPendingDeclaration(reviewData);
    setIsReadOnlyPreview(false);
    setScreen('preview');
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 0);
  };

  const handleSearchByDni = async (event: React.FormEvent) => {
    event.preventDefault();
    clearSaveSuccessOverlay();
    setSearchedDeclaration(null);
    const searchValue = searchDni.trim();
    const normalizedSearch = searchValue.replace(/\D/g, '');
    let declaration: DeclarationData | undefined;

    if (searchValue && isServerConfigured()) {
      try {
        declaration = await lookupServerRecord(searchValue);
      } catch {
        declaration = undefined;
      }
    } else {
      declaration = declarations.find(item =>
        (normalizedSearch && item.dni.replace(/\D/g, '') === normalizedSearch) ||
        item.matricula.trim().toUpperCase() === searchValue.toUpperCase(),
      );
    }

    if (!searchValue || !declaration) {
      setSearchMessage('No se encontró una declaración guardada con ese DNI o matrícula.');
      return;
    }

    setCurrentDeclaration(withStoredPhoto(declaration));
    setSearchedDeclaration(withStoredPhoto(declaration));
    setIsReadOnlyPreview(true);
    setSearchDni('');
  };

  const handleCreateNew = () => {
    clearSaveSuccessOverlay();
    const newDec = {
      ...INITIAL_DECLARATION,
      id: `dec_${Date.now()}`,
      fechaPresentacion: '',
      fechaVencimiento: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentDeclaration(newDec);
    setIsReadOnlyPreview(false);
    setIsEditingDeclaration(false);
    setIsRenewingDeclaration(false);
    setScreen('form');
  };

  const loadCompleteAdminRecord = async (dec: DeclarationData) => {
    if (!(isAdminMode() || isPortalMode()) || !isServerConfigured()) return dec;
    try {
      return await loadServerRecord(dec.id);
    } catch (error) {
      console.warn("No se pudo cargar el detalle completo; se usa el resumen disponible.", error);
      return dec;
    }
  };

  const handleEdit = async (dec: DeclarationData) => {
    clearSaveSuccessOverlay();
    const complete = await loadCompleteAdminRecord(dec);
    setCurrentDeclaration(withStoredPhoto(normalizeDeclaration(complete)));
    setIsReadOnlyPreview(false);
    setIsEditingDeclaration(true);
    setIsRenewingDeclaration(false);
    setScreen('form');
  };
  const handleMemberAccess = async (dec: DeclarationData) => {
    const updated = { ...dec, memberEnabled: dec.memberEnabled === false, updatedAt: new Date().toISOString() };
    try {
      const saved = isServerConfigured() ? await saveServerRecord(updated) : updated;
      const normalized = normalizeDeclaration(saved);
      adminRefreshVersionRef.current += 1;
      // El servidor ya confirmó el cambio; se conserva la vista confirmada antes de sincronizar de nuevo.
      adminRefreshPausedUntilRef.current = Date.now() + 1500;
      setDeclarations(current => current.map(item => item.id === normalized.id ? normalized : item));
      if (currentDeclaration.id === normalized.id) setCurrentDeclaration(normalized);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo actualizar el acceso del colegiado.');
    }
  };
  const handleSendBianualAlert = async (dec: DeclarationData, message: string) => {
    try {
      const current = isServerConfigured() ? await loadServerRecord(dec.id) : dec;
      const alert = {
        message: message.trim(),
        createdAt: new Date().toISOString(),
      };
      const previousHistory = Array.isArray(current.bianualAlertHistory) ? current.bianualAlertHistory : [];
      const historyWithLegacyAlert = current.bianualAlert && !previousHistory.some((item) => item.createdAt === current.bianualAlert?.createdAt) ? [...previousHistory, current.bianualAlert] : previousHistory;
      const bianualAlertHistory = [...historyWithLegacyAlert, alert];
      const saved = isServerConfigured()
        ? await saveServerRecord({ ...current, bianualAlert: alert, bianualAlertHistory })
        : { ...current, bianualAlert: alert, bianualAlertHistory, updatedAt: new Date().toISOString() };
      const normalized = normalizeDeclaration(saved);
      setDeclarations((currentList) => {
        const next = currentList.map((item) => item.id === normalized.id ? normalized : item);
        safeSetLocalStorage('cokifimi_declarations', JSON.stringify(next.map(withoutBinaryAttachments)));
        return next;
      });
      return normalized;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo enviar la alerta al colegiado.');
      throw error;
    }
  };
  const handleDeleteBianualAlerts = async (dec: DeclarationData) => {
    try {
      const current = isServerConfigured() ? await loadServerRecord(dec.id) : dec;
      const { bianualAlert: _removedAlert, bianualAlertHistory: _removedHistory, ...withoutAlerts } = current;
      const saved = isServerConfigured()
        ? await saveServerRecord(withoutAlerts)
        : { ...withoutAlerts, updatedAt: new Date().toISOString() };
      const normalized = normalizeDeclaration(saved);
      setDeclarations((currentList) => {
        const next = currentList.map((item) => item.id === normalized.id ? normalized : item);
        safeSetLocalStorage('cokifimi_declarations', JSON.stringify(next.map(withoutBinaryAttachments)));
        return next;
      });
      return normalized;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudieron eliminar las alertas del colegiado.');
      throw error;
    }
  };
  const handleUpdateConsultorioValidation = async (dec: DeclarationData) => {
    // Invalida cualquier lectura iniciada antes de resolver la solicitud.
    adminRefreshVersionRef.current += 1;
    adminRefreshPausedUntilRef.current = Date.now() + 8000;
    try {
      let saved: DeclarationData;
      const consultorioUpdatePayload = dec.consultorioSolicitudId
        ? { ...dec, formularioHabilitacionConsultorio: { ...((dec.consultorioSolicitudes || []).find((request) => request.id === dec.consultorioSolicitudId)?.formularioHabilitacionConsultorio || {}), ...(dec.formularioHabilitacionConsultorio || {}) } }
        : dec;
      const storedConsultorioRequests = declarations.find((item) => item.id === dec.id)?.consultorioSolicitudes || [];
      const isExistingConsultorioRequest = Boolean(dec.consultorioSolicitudId && storedConsultorioRequests.some((request) => request.id === dec.consultorioSolicitudId));
      try {
        saved = isServerConfigured() ? isExistingConsultorioRequest ? await updateConsultorioServer({ ...dec, formularioHabilitacionConsultorio: consultorioUpdatePayload.formularioHabilitacionConsultorio }) : await saveServerRecord({ ...dec, consultorioSolicitudes: Array.isArray(dec.consultorioSolicitudes) ? dec.consultorioSolicitudes : [], formularioHabilitacionConsultorio: consultorioUpdatePayload.formularioHabilitacionConsultorio }) : dec;
      } catch (error) {
        const missingConsultorioRoute =
          error instanceof Error &&
          /rest_no_route|no se ha encontrado ninguna ruta|consultorio_request_not_found|solicitud de alta no encontrada/i.test(error.message);
        if (!missingConsultorioRoute) throw error;
        saved = await saveServerRecord({
          ...dec,
          consultorioSolicitudes: Array.isArray(dec.consultorioSolicitudes)
            ? dec.consultorioSolicitudes
            : [],
          formularioHabilitacionConsultorio: consultorioUpdatePayload.formularioHabilitacionConsultorio,
        });
      }
      const normalized = normalizeDeclaration(saved);
      adminRefreshVersionRef.current += 1;
      // El servidor ya confirmó el cambio; se conserva la vista confirmada antes de sincronizar de nuevo.
      adminRefreshPausedUntilRef.current = Date.now() + 1500;
      setDeclarations(current => {
        const next = current.map(item => item.id === normalized.id ? normalized : item);
        safeSetLocalStorage('cokifimi_declarations', JSON.stringify(next.map(withoutBinaryAttachments)));
        return next;
      });
      localStorage.removeItem('cokifimi_current_draft');
      if (currentDeclaration.id === normalized.id) {
        setCurrentDeclaration(withStoredPhoto(normalized));
      }
      return normalized;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo validar el Formulario 2.');
      throw error;
    }
  };  const handleDeleteConsultorio = async (id: string, solicitudId?: string, domicilio?: string) => {
    try {
      const current = declarations.find(item => item.id === id);
      if (!current) return;
      if (solicitudId && !(current.consultorioSolicitudes || []).some(request => request.id === solicitudId || request.formularioHabilitacionConsultorio?.consultorioSolicitudId === solicitudId)) {
        return;
      }
      const key = solicitudId ? `${id}:${solicitudId}` : `${id}:principal`;
      setHiddenConsultorioRequestKeys((prev) => prev.includes(key) ? prev : [...prev, key]);
      // The DELETE endpoint already persists the filtered record. Saving the
      // stale `current` record again here recreates the alta that was just
      // removed when the next refresh runs.
      let deletedServerRecord: DeclarationData | undefined;
      if (isServerConfigured()) {
        try {
          deletedServerRecord = await deleteConsultorioServer(id, solicitudId, domicilio);
        } catch (deleteError) {
          if (!domicilio || !solicitudId) throw deleteError;
          deletedServerRecord = await deleteConsultorioServer(id, undefined, domicilio);
        }
      }
      const targetAddressKey = domicilio ? normalizeAddress(domicilio) : "";
      const requestMatches = (request: { id?: string; formularioHabilitacionConsultorio?: Record<string, unknown> }) => solicitudId ? (request.id === solicitudId || request.formularioHabilitacionConsultorio?.consultorioSolicitudId === solicitudId) : Boolean(targetAddressKey) && addressOf(request.formularioHabilitacionConsultorio) === targetAddressKey;
      const remainingRequests = (current.consultorioSolicitudes ?? []).filter((request) => !requestMatches(request));
      const updated = deletedServerRecord || {
            ...current,
            consultorioSolicitudes: remainingRequests,
            formularioHabilitacionConsultorio: solicitudId
              ? current.formularioHabilitacionConsultorio
              : undefined,
          };      setDeclarations((currentList) => {
        const nextList = currentList.map((item) => {
          if (item.id !== id) return item;
          const remainingRequests = (updated?.consultorioSolicitudes ?? item.consultorioSolicitudes ?? []).filter((request) => !requestMatches(request));
          return {
            ...item,
            ...(updated || {}),
            consultorioSolicitudes: remainingRequests,
            formularioHabilitacionConsultorio: solicitudId
              ? item.formularioHabilitacionConsultorio
              : undefined,
            updatedAt: new Date().toISOString(),
          };
        });
        safeSetLocalStorage('cokifimi_declarations', JSON.stringify(nextList.map(withoutBinaryAttachments)));
        return nextList;
      });

    } catch (error) {
      const key = solicitudId ? `${id}:${solicitudId}` : `${id}:principal`;
      setHiddenConsultorioRequestKeys((prev) => prev.filter((item) => item !== key));
      window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el alta de consultorio.');
      throw error;
    }
  };

  const handleDeleteAllConsultorios = async () => {
    if (!isServerConfigured()) throw new Error('El servidor no está configurado.');
    await deleteAllConsultoriosServer();
    setDeclarations((currentList) => {
      const nextList = currentList.map((item) => ({
        ...item,
        formularioHabilitacionConsultorio: undefined,
        consultorioSolicitudes: [],
        consultorioSolicitudId: undefined,
      }));
      safeSetLocalStorage('cokifimi_declarations', JSON.stringify(nextList.map(withoutBinaryAttachments)));
      return nextList;
    });
  };


  const handleResetMemberToken = async (dec: DeclarationData) => {
    const updated = { ...dec, memberAccessTokenHash: '', memberEnabled: true, memberTokenFailedAttempts: 0, memberTokenBlocked: false, updatedAt: new Date().toISOString() };
    try {
      const saved = isServerConfigured() ? await saveServerRecord(updated) : updated;
      const normalized = normalizeDeclaration(saved);
      adminRefreshVersionRef.current += 1;
      // El servidor ya confirmó el cambio; se conserva la vista confirmada antes de sincronizar de nuevo.
      adminRefreshPausedUntilRef.current = Date.now() + 1500;
      setDeclarations(current => current.map(item => item.id === normalized.id ? normalized : item));
      if (currentDeclaration.id === normalized.id) setCurrentDeclaration(normalized);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo restablecer el token del colegiado.');
    }
  };

  const handleSelect = async (dec: DeclarationData) => {
    clearSaveSuccessOverlay();
    const complete = await loadCompleteAdminRecord(dec);
    setCurrentDeclaration(withStoredPhoto(complete));
    setIsReadOnlyPreview(false);
    setIsEditingDeclaration(false);
    setIsRenewingDeclaration(false);
    setPendingDeclaration(null);
    setScreen('preview');
    window.setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }), 0);
  };
  const handleDelete = async (id: string) => {
    if (true) {
      if (isAdminMode() && isServerConfigured()) {
        try {
          await deleteServerRecord(id);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el registro.');
          return;
        }
      }
      const updatedList = declarations.filter(dec => dec.id !== id);
      setDeclarations(updatedList);
      safeSetLocalStorage('cokifimi_declarations', JSON.stringify(updatedList.map(withoutBinaryAttachments)));
      localStorage.removeItem(getPhotoStorageKey(id));
      
      if (currentDeclaration.id === id) {
        if (updatedList.length > 0) {
          setCurrentDeclaration(updatedList[0]);
        } else {
          setCurrentDeclaration({ ...INITIAL_DECLARATION, id: `dec_${Date.now()}` });
        }
      }
    }
  };

  const handleDuplicate = async (dec: DeclarationData) => {
    let duplicated: DeclarationData = {
      ...withStoredPhoto(dec),
      id: `dec_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fechaPresentacion: new Date().toISOString().split('T')[0],
      fechaVencimiento: (() => {
        const d = new Date();
        return `${d.getFullYear() + 2}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })()
    };
    if (isServerConfigured()) {
      try {
        duplicated = await saveServerRecord(duplicated);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'No se pudo duplicar el registro.');
        return;
      }
    }
    const updatedList = [duplicated, ...declarations];
    setDeclarations(updatedList);
    safeSetLocalStorage('cokifimi_declarations', JSON.stringify(updatedList.map(withoutBinaryAttachments)));
    setCurrentDeclaration(duplicated);
    setIsEditingDeclaration(false);
    setIsRenewingDeclaration(true);
    setScreen('form');
  };

  const handleReset = () => {
    if (
      window.confirm(
        '¿Está seguro de que desea limpiar todos los campos del formulario? Esta acción borrará los datos cargados actualmente.',
      )
    ) {
      const resetData = {
        ...INITIAL_DECLARATION,
        id: `dec_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCurrentDeclaration(resetData);
      setResetKey((previous) => previous + 1);
    }
  };

  const duplicateRecordIsActive = duplicateDniRecord?.fechaVencimiento
    ? new Date(`${duplicateDniRecord.fechaVencimiento}T23:59:59`) >= new Date()
    : false;
  const duplicateRecordExpiry = duplicateDniRecord?.fechaVencimiento
    ? new Date(`${duplicateDniRecord.fechaVencimiento}T00:00:00`).toLocaleDateString('es-AR')
    : 'sin fecha registrada';

  return (
    <div className={`cokifimi-app ${isPortalMode() ? 'cokifimi-admin-portal' : ''} min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between print:bg-white print:min-h-0`}>
      <nav className="bg-white border-b border-gray-200/80 sticky top-0 z-50 shadow-sm px-4 py-3.5 md:px-8 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => {}}>
           <CoKiFiMiLogo size={58} />
            <div className="hidden sm:block text-left">
              <h1 className="font-sans font-extrabold text-[#0F5A3E] text-xs uppercase tracking-wide leading-tight">
               
              </h1>
              <p className="text-[10px] text-gray-500 font-mono"></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPortalMode() && portalAuthenticated && screen !== 'dashboard' && (
              <button
                onClick={() => setScreen('dashboard')}
                className="text-xs font-bold text-white bg-[#0F5A3E] hover:bg-[#0c4731] px-4 py-2 rounded-xl transition-all"
              >
                Volver al inicio Admin
              </button>
            )}

            {isPortalMode() && portalAuthenticated && (
              <button
                onClick={handlePortalLogout}
                className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-all"
              >
                Cerrar sesión
              </button>
            )}

            {screen === 'preview' && !isReadOnlyPreview && (
              <button
                onClick={() => {
                  if (isPortalMode()) setIsEditingDeclaration(true);
                  setScreen('form');
                }}
                className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-all"
              >
                Modificar Datos
              </button>
            )}

            

            {screen === 'form' && !searchedDeclaration && !(isPortalMode() && isEditingDeclaration) && (
              <button
                onClick={handleReset}
                className="cokifimi-header-reset bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                title="Limpiar y comenzar nuevo formulario"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar Formulario
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className={`flex-grow max-w-7xl w-full mx-auto px-4 py-8 md:px-8 print:p-0 print:m-0 print:max-w-none ${isPortalMode() && screen === 'dashboard' ? 'cokifimi-admin-dashboard-main' : ''}`}>
        <AnimatePresence mode="wait">
          {screen === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <DeclarationDashboard
                declarations={declarations}
                highlightedDeclarationId={highlightedDeclarationId}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onMemberAccess={handleMemberAccess}
                onResetMemberToken={handleResetMemberToken}
                onDelete={handleDelete}
                onDeleteConsultorio={handleDeleteConsultorio} onDeleteAllConsultorios={handleDeleteAllConsultorios}
                onDuplicate={handleDuplicate}
                onCreateNew={handleCreateNew}
                onUpdateConsultorioValidation={handleUpdateConsultorioValidation}
                onSendBianualAlert={handleSendBianualAlert}
                onDeleteBianualAlerts={handleDeleteBianualAlerts}
              />
            </motion.div>
          )}

          {screen === 'portal-login' && (
            <motion.div
              key="portal-login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <PortalLogin onSuccess={handlePortalLogin} />
            </motion.div>
          )}

          {screen === 'form' && (
            <motion.div
              key={`form-${resetKey}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {false && <form onSubmit={handleSearchByDni} className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1">
                    <label htmlFor="search-dni" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700">Buscar declaración por DNI o matrícula</label>
                    <input
                      id="search-dni"
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 36.061.001 o 761"
                      value={searchDni}
                      onChange={event => setSearchDni(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button type="submit" className="cokifimi-search-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold shadow-sm transition-colors">
                    <Search className="h-4 w-4" />
                    Buscar y visualizar
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">Ingrese el DNI o la matrícula para consultar los datos guardados y volver a imprimir la declaración.</p>
              </form>}
              {searchedDeclaration ? (
                <DeclarationPreview
                  data={searchedDeclaration}
                  onEdit={undefined}
                  isPendingSave={false}
                  onBack={() => setSearchedDeclaration(null)}
                />
              ) : (
                <FormWizard
                  initialData={currentDeclaration}
                  onSave={handleSaveFromWizard}
                  onReview={handleReviewFromWizard}
                  onCancel={handleReset}
                  readOnlyDates={false}
                />
              )}
            </motion.div>
          )}

          {screen === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <DeclarationPreview
                data={currentDeclaration}
                onEdit={isReadOnlyPreview ? undefined : () => setScreen('form')}
                onConfirmSave={pendingDeclaration ? () => { setSaveFeedback('saving'); void handleSaveFromWizard(pendingDeclaration); } : undefined}
                isPendingSave={Boolean(pendingDeclaration)}
                onBack={() => setScreen('dashboard')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {saveFeedback === 'saving' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[4px] print:hidden" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#0F5A3E]" />
            <p className="mt-4 text-sm font-extrabold text-slate-900">Guardando cambios...</p>
            <p className="mt-1 text-xs text-slate-500">Aguarde un momento.</p>
          </div>
        </div>
      )}
      {saveSuccessDeclaration && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[4px] print:hidden" role="dialog" aria-modal="true" aria-labelledby="save-success-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[#0F5A3E]">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#0F5A3E]">{isAdminMode() ? "Guardado correctamente" : saveSuccessMode === "updated" ? "Actualizado" : "Guardado exitoso"}</p>
                <h2 id="save-success-title" className="mt-1 text-lg font-extrabold text-slate-900">{isAdminMode() ? "La declaración quedó guardada correctamente" : saveSuccessMode === "updated" ? "La declaración se actualizó correctamente" : "Se guardó el registro correctamente"}</h2>
              </div>
            </div>
            <p className={saveSuccessMode === "updated" && isAdminMode() ? "hidden" : "mt-5 text-sm leading-relaxed text-slate-600"}>{saveSuccessMode === "updated" ? "Los cambios quedaron guardados. Volviendo al panel de administración." : "La declaración quedó guardada. Descargá ahora el archivo PDF para conservarlo o presentarlo."}</p>
            <div className={saveSuccessMode === "updated" && isAdminMode() ? "hidden" : "mt-6 flex justify-end"}>
              <button
                type="button"
                className="cokifimi-save-success-button inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm"
                onClick={() => {
                  const updatedId = saveSuccessDeclaration.id;
                  setSaveSuccessDeclaration(null);
                  if (saveSuccessMode === 'updated' && isAdminMode()) {
                    setScreen('dashboard');
                  } else {
                    window.setTimeout(() => document.getElementById('btn-print-pdf')?.click(), 0);
                  }
                }}
              >
                {saveSuccessMode === "updated" ? "Volver al Admin" : "Descargar declaración"}
              </button>
            </div>
          </div>
        </div>
      )}

      {searchMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[4px]" role="dialog" aria-modal="true" aria-labelledby="search-message-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Búsqueda</p>
                <h2 id="search-message-title" className="mt-1 text-lg font-extrabold text-slate-900">No se encontró la declaración</h2>
              </div>
            </div>
            <p className={saveSuccessMode === "updated" && isAdminMode() ? "hidden" : "mt-5 text-sm leading-relaxed text-slate-600"}>{searchMessage}</p>
            <div className={saveSuccessMode === "updated" && isAdminMode() ? "hidden" : "mt-6 flex justify-end"}>
              <button type="button" onClick={() => setSearchMessage('')} className="rounded-xl bg-[#0F5A3E] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c4731]">
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateDniRecord && (
        <div className="cokifimi-duplicate-modal fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="duplicate-dni-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Registro encontrado</p>
                <h2 id="duplicate-dni-title" className="mt-1 text-lg font-extrabold text-slate-900">{isAdminMode() ? 'Declaración Jurada existente' : 'Registro activo'}</h2>
              </div>
            </div>
            <p className={saveSuccessMode === "updated" && isAdminMode() ? "hidden" : "mt-5 text-sm leading-relaxed text-slate-600"}>
              {duplicateRecordIsActive ? (
                <>Ya existe un registro activo de <strong>Declaración Jurada</strong> con vencimiento el <strong>{duplicateRecordExpiry}</strong>.</>
              ) : (
                <>Usted ya tiene un registro de <strong>Declaración Jurada</strong> vencido el <strong>{duplicateRecordExpiry}</strong>. Puede renovarlo desde el panel de administración.</>
              )}
            
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {isAdminMode()
                ? `Registro: ${duplicateDniRecord.apellido}, ${duplicateDniRecord.nombres}. Puede copiar/renovar o editar este registro existente desde el panel de administración.`
                : 'No es necesario volver a completar una nueva declaración mientras este registro se encuentre vigente. En caso de actualizar información, comuníquese con la '} <strong>Administración</strong>.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDuplicateDniRecord(null)} className="cokifimi-duplicate-modal-cancel rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">{isAdminMode() ? 'Volver al formulario' : 'Entendido'}</button>
              {isAdminMode() && (
                <button type="button" onClick={() => { setDuplicateDniRecord(null); setScreen('dashboard'); }} className="cokifimi-duplicate-modal-confirm rounded-xl bg-[#0F5A3E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0c4731]">Ir al inicio Admin</button>
              )}
            </div>
          </div>
        </div>
      )}
      {screen !== 'preview' && !searchedDeclaration && (
        <footer className="bg-white border-t border-gray-200/80 py-6 px-4 text-center text-xs text-gray-500 font-mono print:hidden mt-12">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p>&copy; {new Date().getFullYear()} Colegio de Kinesiólogos y Fisioterapeutas de Misiones. Todos los derechos reservados.</p>
            <div className="flex items-center gap-1 text-[#0F5A3E] font-bold font-sans">
              <Award className="w-4 h-4" />
              <span>Sistema Oficial de Declaración Jurada </span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
