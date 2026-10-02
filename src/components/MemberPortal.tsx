import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FilePenLine,
  KeyRound,
  LogIn,
  LogOut,
  MailCheck,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRound,
  LoaderCircle,
  Link2,
  Unlink,
  X,
  History,
  Clock3,
  MessageSquareText,
  CircleDollarSign,
  BadgeCheck,
  Activity,
  BellRing,
  AlertTriangle,
} from "lucide-react";
import {
  ConsultorioData,
  DeclarationData,
  INITIAL_DECLARATION,
} from "../types";
import { normalizeMisionesLocality } from "../data/misionesLocalities";
import {
  memberAddConsultorio,
  memberManageAttached,
  memberLogin,
  memberLogout,
  memberMe,
  memberRequestCode,
  memberSaveRecord,
  memberVerify,
  lookupServerRecord,
} from "../api";
import { generateAutomaticCertificates } from "../utils/certificates";
import FormWizard from "./FormWizard";
import DeclarationPreview from "./DeclarationPreview";
import CoKiFiMiLogo from "./CoKiFiMiLogo";
import ConsultorioHabilitacionForm, {
  ConsultorioHabilitacionPreview,
} from "./ConsultorioHabilitacionForm";

type Screen =
  | "access"
  | "verify"
  | "dashboard"
  | "form"
  | "preview"
  | "consultorio"
  | "consultorio-preview"
  | "consultorio-view";

const EMPTY_CONSULTORIO: ConsultorioData = {
  domicilio: "",
  numeracion: "",
  ciudad: "",
  esTitularConsultorio: "SI",
  esProfesionalAdjunto: "NO",
  nombreTitularConsultorio: "",
  fechaInicioConsultorio: "",
  numeroMatriculaConsultorio: "",
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const isEmailAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isGmailAddress = (value: string) =>
  /^[^\s@]+@gmail\.com$/i.test(value.trim());
const isSecureAccessToken = (token: string, memberDni: string) => {
  if (!/^\d{6}$/.test(token) || /^(\d)\1{5}$/.test(token)) return false;
  const hasConsecutiveDigits =
    /012|123|234|345|456|567|678|789|987|876|765|654|543|432|321|210/.test(
      token,
    );
  const dniStart = onlyDigits(memberDni).slice(0, 3);
  return !hasConsecutiveDigits && (!dniStart || !token.includes(dniStart));
};
const readPaymentFile = (file: File): Promise<{ url: string; name: string }> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
  reader.onload = () => {
    const originalUrl = String(reader.result || "");
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name) || !file.type.startsWith("image/")) {
      resolve({ url: originalUrl, name: file.name });
      return;
    }
    const image = new Image();
    image.onerror = () => reject(new Error("No se pudo procesar la imagen seleccionada."));
    image.onload = () => {
      const maxDimension = 1600;
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) { resolve({ url: originalUrl, name: file.name }); return; }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ url: canvas.toDataURL("image/jpeg", 0.78), name: file.name.replace(/\.[^.]+$/, "") + ".jpg" });
    };
    image.onerror = () => resolve({ url: originalUrl, name: file.name });
    image.src = originalUrl;
  };
  reader.onerror = () => resolve({ url: "", name: file.name });
  reader.readAsDataURL(file);
});
const normalizeRecord = (data: DeclarationData): DeclarationData => ({
  ...INITIAL_DECLARATION,
  ...data,
  ...(data.memberProvisional ? { apellido: "", nombres: "" } : {}),
  id: data.id || `dec_${Date.now()}`,
  consultorios: data.consultorios || [],
});
type ConsultorioRequestEntry = NonNullable<DeclarationData["consultorioSolicitudes"]>[number];

const mergeConsultorioRequests = (
  previous: DeclarationData | null | undefined,
  incoming: DeclarationData | null | undefined,
) => {
  const merged: ConsultorioRequestEntry[] = [];
  const seen = new Map<string, ConsultorioRequestEntry>();
  const append = (items?: DeclarationData["consultorioSolicitudes"]) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item?.id) continue;
      const current = seen.get(item.id);
      seen.set(item.id, current ? { ...current, ...item } : item);
    }
  };
  append(previous?.consultorioSolicitudes);
  append(incoming?.consultorioSolicitudes);
  for (const item of seen.values()) merged.push(item);
  return merged;
};
const resolveConsultorioPaymentRequestId = (
  record: DeclarationData | null | undefined,
  candidateId: string | undefined,
  form: Record<string, string | boolean | undefined | unknown[]>,
) => {
  const requests = record?.consultorioSolicitudes || [];
  if (candidateId && requests.some((request) => request.id === candidateId)) return candidateId;
  const addressKey = [
    form.domicilioConsultorio,
    form.numeroConsultorio,
    form.localidadConsultorio,
  ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (!addressKey) return undefined;
  return requests.find((request) => {
    const requestForm = request.formularioHabilitacionConsultorio || {};
    const requestAddressKey = [
      requestForm.domicilioConsultorio,
      requestForm.numeroConsultorio,
      requestForm.localidadConsultorio,
    ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    return requestAddressKey === addressKey;
  })?.id;
};
const parseDateOnly = (value: string) => {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const reversed = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (reversed) return new Date(Number(reversed[3]), Number(reversed[2]) - 1, Number(reversed[1]));
  return new Date(text);
};const formatDateOnly = (value?: string) =>
  value
    ? parseDateOnly(value).toLocaleDateString("es-AR")
    : "sin fecha registrada";
const isBianualAlertVisible = (alert?: DeclarationData["bianualAlert"]) => {
  if (!alert?.message?.trim()) return false;
  const createdAt = Date.parse(alert.createdAt || "");
  if (!Number.isFinite(createdAt)) return true;
  return Date.now() - createdAt < 5 * 24 * 60 * 60 * 1000;
};
const formatSubmissionDate = (value?: string | boolean) =>
  typeof value === "string" && value
    ? new Date(value).toLocaleDateString("es-AR")
    : "sin fecha registrada";
const consultorioHistorySnapshot = (form: Record<string, unknown>) => ({
  submittedAt: String(form.submittedAt || ""),
  certificadoVigenciaDesde: String(form.certificadoVigenciaDesde || ""),
  certificadoVigenciaHasta: String(form.certificadoVigenciaHasta || ""),
  importeConfirmado: String(form.importeConfirmado || ""),
  estadoAdmin: String(form.estadoAdmin || ""),
  estadoImporte: String(form.estadoImporte || ""),
  estadoPago: String(form.estadoPago || ""),
  mensajeAdmin: String(form.mensajeAdmin || form.descripcionCertificado || ""),
  resueltoAt: String(form.validadoAt || form.rechazadoAt || ""),
  registradoAt: new Date().toISOString(),
});

const consultorioStatusLabel = (form: Record<string, unknown>) => {
  const rejected = form.estadoAdmin === "RECHAZADO";
  const validated = !rejected && (form.validadoAdmin === true || form.estadoAdmin === "APROBADO");
  if (validated) return "Solicitud aprobada";
  if (rejected) return "Solicitud rechazada";
  if (form.estadoPago === "PAGO_VALIDADO") return "Pago validado · pendiente de aprobación";
  if (form.estadoPago === "COMPROBANTE_RECIBIDO") return "Comprobante recibido · en verificación";
  if (form.estadoImporte === "IMPORTE_CONFIRMADO") return "Esperando pago";
  return "Pendiente de revisión";
};

type MemberPortalVariant = 'standard' | 'register' | 'login';


export default function MemberPortal({
  variant = 'standard',
}: {
  variant?: MemberPortalVariant;
}) {
  const [screen, setScreen] = useState<Screen>("access");
  const registrationOnly = variant === 'register';
  const loginOnly = variant === 'login';

  const getProfessionalRoleLabel = (data: DeclarationData) => {
    const isYes = (value: unknown) =>
      ["SI", "SÍ", "YES", "TRUE"].includes(String(value ?? "").trim().toUpperCase());
    const isNo = (value: unknown) =>
      ["NO", "N", "FALSE"].includes(String(value ?? "").trim().toUpperCase());
    const consultorios = data.consultorios || [];
    const noTrabajaEnConsultorio = data.trabajaConsultorio !== "SI" || consultorios.length === 0;
    const titular =
      isYes(data.esTitularConsultorio) ||
      consultorios.some((consultorio) => isYes(consultorio.esTitularConsultorio));
    const consultorioAdjunto = consultorios.some(
      (consultorio) =>
        isNo(consultorio.esTitularConsultorio) &&
        isYes(consultorio.esProfesionalAdjunto),
    );
    const directAdjunto =
      consultorios.length === 0 && isYes(data.esProfesionalAdjunto);

    if (titular && (directAdjunto || consultorioAdjunto)) return "Profesional Adjunto y titular";
    if (titular) return "Titular de consultorio";
    if (directAdjunto || consultorioAdjunto) return "Profesional adjunto";
    if (noTrabajaEnConsultorio) return "No trabaja en consultorio / área kinésica";
    return "Estado profesional";
  };
  const isCurrentlyAdjunto = (data: DeclarationData) => {
    const yes = (value: unknown) => ["SI", "SÍ", "YES", "TRUE", "1"].includes(String(value ?? "").trim().toUpperCase());
    const consultorios = data.consultorios || [];
    if (consultorios.length > 0) return consultorios.some((item) => String(item.esTitularConsultorio || "").toUpperCase() === "NO" && yes(item.esProfesionalAdjunto));
    return yes(data.esProfesionalAdjunto);
  };
  const isTitularRecord = (data: DeclarationData) => {
    const yes = (value: unknown) => ["SI", "SÍ", "YES", "TRUE", "1"].includes(String(value ?? "").trim().toUpperCase());
    return yes(data.esTitularConsultorio) || (data.consultorios || []).some((item) => yes(item.esTitularConsultorio));
  };
  const downloadAttachment = (file: string | undefined, fallbackName: string) => {
    if (!file) return;
    const anchor = document.createElement("a");
    anchor.href = file;
    anchor.download = fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  const [dni, setDni] = useState("");
  const [registrationDni, setRegistrationDni] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [record, setRecord] = useState<DeclarationData | null>(null);
  const [pendingRecord, setPendingRecord] = useState<DeclarationData | null>(
    null,
  );
  const [pendingConsultorioRecord, setPendingConsultorioRecord] =
    useState<DeclarationData | null>(null);
  const [newConsultorioRequestId, setNewConsultorioRequestId] = useState<string | null>(null);
  const [addingConsultorio, setAddingConsultorio] = useState(false);
  const [newConsultorioBlockedAddresses, setNewConsultorioBlockedAddresses] = useState<string[]>([]);
  const editingExistingConsultorio = Boolean(
    newConsultorioRequestId &&
    record?.consultorioSolicitudId === newConsultorioRequestId &&
    record?.formularioHabilitacionConsultorio?.submittedAt,
  );
  const [consultorio, setConsultorio] =
    useState<ConsultorioData>(EMPTY_CONSULTORIO);
  const [message, setMessage] = useState("");
  const [showUpdatedModal, setShowUpdatedModal] = useState(false);
  const [updatedModalMode, setUpdatedModalMode] = useState<"updated" | "libre-deuda">("updated");
  const [consultorioHistoryForm, setConsultorioHistoryForm] = useState<Record<string, unknown> | null>(null);
  const [pendingPaymentFile, setPendingPaymentFile] = useState<{ url: string; name: string } | null>(null);
  const [paymentSending, setPaymentSending] = useState(false);
  const [paymentSent, setPaymentSent] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<"sending" | "sent" | null>(null);
  const [pendingPaymentFilesByRequest, setPendingPaymentFilesByRequest] = useState<Record<string, { url: string; name: string } | null>>({});
  const [paymentSendingByRequest, setPaymentSendingByRequest] = useState<Record<string, boolean>>({});
  const [paymentSentByRequest, setPaymentSentByRequest] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"login" | "code" | "">("");
  const [firstAccessHelpOpen, setFirstAccessHelpOpen] = useState(false);
  const [bianualRequiredOpen, setBianualRequiredOpen] = useState(false);
  const [tokenBlockedOpen, setTokenBlockedOpen] = useState(false);
  const [tokenResetOpen, setTokenResetOpen] = useState(false);
  const [memberNotRegisteredOpen, setMemberNotRegisteredOpen] = useState(false);
  const [tokenLegalAccepted, setTokenLegalAccepted] = useState(false);
  const [adjuntoAltaNotification, setAdjuntoAltaNotification] = useState<{ recordId: string; submittedAt: string; titularName: string; titularMatricula: string } | null>(null);
  const [attachedConsultorioRecords, setAttachedConsultorioRecords] = useState<DeclarationData[]>([]);
  const [attachedSearchMatricula, setAttachedSearchMatricula] = useState("");
  const [attachedActionLoading, setAttachedActionLoading] = useState("");
  const [attachedSearchByRequest, setAttachedSearchByRequest] = useState<Record<string, string>>({});
  const [attachedActionErrorByRequest, setAttachedActionErrorByRequest] = useState<Record<string, string>>({});
  const showBianualNoticeOnFirstAccess = (candidate: DeclarationData | null) => {
    if (!candidate?.memberProvisional) return;
    const noticeKey = "cokifimi_bianual_notice_seen_" + (candidate.id || candidate.matricula);
    if (window.sessionStorage.getItem(noticeKey)) return;
    window.sessionStorage.setItem(noticeKey, "1");
    setBianualRequiredOpen(true);
  };

  useEffect(() => {
    if (!record?.matricula) {
      setAttachedConsultorioRecords([]);
      return undefined;
    }
    let cancelled = false;
    const loadAttachedConsultorios = async () => {
      let candidates: DeclarationData[] = [];
      try {
        const local = JSON.parse(window.localStorage.getItem("cokifimi_declarations") || "[]");
        candidates = Array.isArray(local) ? local : [];
      } catch { /* El servidor continúa siendo la fuente principal. */ }

      const currentForm = record.formularioHabilitacionConsultorio || {};
      const attachedMatriculas = ["", ...Array.from({ length: 7 }, (_, index) => String(index + 2))]
        .map((suffix) => onlyDigits(String(currentForm["adjuntoMatricula" + suffix] || "")))
        .filter(Boolean);

      for (const matricula of attachedMatriculas) {
        try {
          const direct = await lookupServerRecord(matricula);
          if (direct) candidates.push(direct);
        } catch { /* Si no está publicado, se conserva la copia local. */ }
      }

      const attached = attachedMatriculas
        .map((matricula) => candidates.find((candidate) =>
          candidate.id !== record.id && onlyDigits(String(candidate.matricula || "")) === matricula,
        ))
        .filter((candidate): candidate is DeclarationData => Boolean(candidate));
      const unique = attached.filter((candidate, index, list) =>
        list.findIndex((item) => item.id === candidate.id) === index,
      );
      if (!cancelled) setAttachedConsultorioRecords(unique);
    };
    void loadAttachedConsultorios();
    return () => { cancelled = true; };
  }, [record?.id, record?.matricula, record?.updatedAt]);

  useEffect(() => {
    if (!record?.matricula) return undefined;
    let cancelled = false;
    const findAdjuntoAlta = async () => {
      let candidates: DeclarationData[] = [];
      try {
        const local = JSON.parse(window.localStorage.getItem("cokifimi_declarations") || "[]");
        candidates = Array.isArray(local) ? local : [];
      } catch { /* La fuente principal será el servidor. */ }
      const ownMatricula = onlyDigits(record.matricula);
      const matches = candidates.filter((candidate) => {
        if (!candidate.id || candidate.id === record.id) return false;
        const form = candidate.formularioHabilitacionConsultorio || {};
        if (!form.submittedAt) return false;
        return ["", ...Array.from({ length: 7 }, (_, index) => String(index + 2))].some((suffix) =>
          onlyDigits(String(form[`adjuntoMatricula${suffix}`] || "")) === ownMatricula,
        );
      });
      const alta = matches.find((candidate, index, list) =>
        list.findIndex((item) => item.id === candidate.id && item.formularioHabilitacionConsultorio?.submittedAt === candidate.formularioHabilitacionConsultorio?.submittedAt) === index,
      );
      if (!alta || cancelled) return;
      const submittedAt = String(alta.formularioHabilitacionConsultorio?.submittedAt || "");
      const seenKey = `cokifimi_adjunto_alta_vista_${record.id}_${alta.id}_${submittedAt}`;
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, "1");
      setAdjuntoAltaNotification({
        recordId: alta.id,
        submittedAt,
        titularName: `${alta.apellido || ""} ${alta.nombres || ""}`.trim(),
        titularMatricula: String(alta.matricula || ""),
      });
    };
    void findAdjuntoAlta();
    return () => { cancelled = true; };
  }, [record?.id, record?.matricula, record?.updatedAt]);
  // El portal siempre solicita credenciales al abrirse; no reutiliza una cookie previa.
  useEffect(() => {
    setRecord(null);
    setScreen("access");
    void memberLogout().catch(() => undefined);
  }, []);

  // El panel del colegiado puede quedar abierto mientras Administración confirma el importe. Refrescamos sólo las vistas de consulta para no sobrescribir datos que el colegiado esté editando en un formulario.
  useEffect(() => {
    if (!record || !["dashboard", "consultorio-view"].includes(screen)) return;
    let active = true;
    const refreshMemberRecord = async () => {
      try {
        const data = await memberMe();
        const activeRecord = "record" in data ? data.record : data;
        if (active && activeRecord) setRecord(normalizeRecord(activeRecord));
      } catch {
        // El estado actual sigue visible si una actualización puntual falla.
      }
    };
    const refreshOnFocus = () => void refreshMemberRecord();
    window.addEventListener("focus", refreshOnFocus);
    const timer = window.setInterval(refreshMemberRecord, 3000);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(timer);
    };
  }, [record?.id, screen]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (screen !== "consultorio-view") return;
    const timeout = window.setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(".cokifimi-consultorio-preview-toolbar")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [screen]);

  useEffect(() => {
    if (screen !== "consultorio") return;
    const timeout = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [screen]);


  const removedAttachedProfessionals = attachedConsultorioRecords.filter((attached) => !isCurrentlyAdjunto(attached));

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!tokenLegalAccepted) {
      setError("Debe aceptar la validez legal de la clave única digital antes de solicitar el código.");
      return;
    }
    if (!isGmailAddress(email)) {
      setError("Debe utilizar un correo de gmail de forma obligatoria.");
      return;
    }
    setLoading(true);
    setLoadingAction("code");
    try {
      await memberRequestCode(onlyDigits(registrationDni), email.trim());
      window.localStorage.removeItem(
        `cokifimi_token_attempts_${onlyDigits(registrationDni)}`,
      );
      setMessage("Enviamos un código de verificación a su correo registrado.");
      setScreen("verify");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo enviar el código.",
      );
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const resendCode = async () => {
    setError("");
    setMessage("");
    if (!isGmailAddress(email)) {
      setError("Debe utilizar un correo de gmail de forma obligatoria.");
      return;
    }
    setLoading(true);
    setLoadingAction("code");
    try {
      await memberRequestCode(onlyDigits(registrationDni), email.trim());
      setMessage("Enviamos un nuevo código de verificación a su correo.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo reenviar el código.",
      );
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const verifyAndCreateToken = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isGmailAddress(email)) {
      setError("Debe utilizar un correo de gmail de forma obligatoria.");
      return;
    }
    if (
      !isSecureAccessToken(onlyDigits(accessToken), onlyDigits(registrationDni))
    ) {
      setError(
        "El token debe tener 6 números, sin secuencias correlativas, repeticiones ni los 3 primeros números de su DNI.",
      );
      return;
    }
    setLoading(true);
    setLoadingAction("code");
    try {
      const response = await memberVerify(
        onlyDigits(registrationDni),
        email.trim(),
        onlyDigits(code),
        onlyDigits(accessToken),
      );
      window.localStorage.removeItem(
        `cokifimi_token_attempts_${onlyDigits(registrationDni)}`,
      );
      const normalizedRecord = response.record ? normalizeRecord(response.record) : null;
      setRecord(normalizedRecord);
      showBianualNoticeOnFirstAccess(normalizedRecord);
      setScreen("dashboard");
      setMessage(
        "Acceso creado correctamente. Guarde su token en un lugar seguro.",
      );
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "No se pudo verificar el código.",
      );
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const loginDni = onlyDigits(dni);
    const attemptKey = `cokifimi_token_attempts_${loginDni}`;
    setLoading(true);
    setLoadingAction("login");
    try {
      const response = await memberLogin(loginDni, onlyDigits(accessToken));
      window.localStorage.removeItem(attemptKey);
      const normalizedRecord = response.record ? normalizeRecord(response.record) : null;
      setRecord(normalizedRecord);
      showBianualNoticeOnFirstAccess(normalizedRecord);
      setScreen("dashboard");
    } catch (loginError) {
      const loginMessage =
        loginError instanceof Error ? loginError.message : "";
      if (loginMessage.toLowerCase().includes("no se encuentra su registro")) {
        setMemberNotRegisteredOpen(true);
        return;
      }
      if (loginMessage.toLowerCase().includes("token fue restablecido")) {
        setTokenResetOpen(true);
        return;
      }
      if (loginMessage.toLowerCase().includes("comunicarse al colegio"))
        setTokenBlockedOpen(true);
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
      setLoadingAction("");
    }
  };

  const logout = async () => {
    await memberLogout().catch(() => undefined);
    setRecord(null);
    setScreen("access");
    setDni("");
    setRegistrationDni("");
    setEmail("");
    setCode("");
    setAccessToken("");
    setMessage("");
    setError("");
  };

  useEffect(() => {
    if (!showUpdatedModal) return undefined;
    const timeout = window.setTimeout(() => setShowUpdatedModal(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [showUpdatedModal]);

  const stripUnchangedDataUrls = (value: unknown, previous: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("data:") && value === previous) return undefined;
    if (Array.isArray(value)) {
      return value.map((item, index) => stripUnchangedDataUrls(item, Array.isArray(previous) ? previous[index] : undefined));
    }
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      const previousObject = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        const compacted = stripUnchangedDataUrls(item, previousObject[key]);
        if (compacted !== undefined) result[key] = compacted;
      });
      return result;
    }
    return value;
  };

  const saveInFlightRef = useRef(false);
  const saveRecord = async (data: DeclarationData): Promise<boolean> => {
    if (saveInFlightRef.current) return false;
    saveInFlightRef.current = true;
    setError("");
    setLoading(true);	
    const updatingInfo = Boolean(record && !record.memberProvisional && !data.formularioHabilitacionConsultorio);
    const sendingLibreDeuda = Boolean(
      data.libreDeudaSolicitud?.submittedAt
      && data.libreDeudaSolicitud.estado === "PENDIENTE"
      && data.libreDeudaSolicitud.submittedAt !== record?.libreDeudaSolicitud?.submittedAt
    );
    try {
      const payload = !data.formularioHabilitacionConsultorio && record
        ? stripUnchangedDataUrls(data, record) as unknown as DeclarationData
        : data;
      const saved = await memberSaveRecord(payload);
      const mergedRecord = normalizeRecord({
        ...record,
        ...saved,
        consultorioSolicitudId: saved.consultorioSolicitudId || record?.consultorioSolicitudId || data.consultorioSolicitudId,
        formularioHabilitacionConsultorio: saved.formularioHabilitacionConsultorio || record?.formularioHabilitacionConsultorio || data.formularioHabilitacionConsultorio,
        consultorioSolicitudes: mergeConsultorioRequests(record, saved),
      });
      setRecord(mergedRecord);
      setPendingRecord(null);
      setScreen("dashboard");
      if (updatingInfo) {
        setMessage("");
        setUpdatedModalMode(sendingLibreDeuda ? "libre-deuda" : "updated");
        setShowUpdatedModal(true);
      } else {
        setMessage("Sus datos fueron actualizados y enviados a administración.");
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la actualización.",
      );
    } finally {
      saveInFlightRef.current = false;
      setLoading(false);
    }
    return false;
  };

  const updateConsultorio = (field: keyof ConsultorioData, value: string) => {
    setConsultorio((previous) => ({
      ...previous,
      [field]: field === "fechaInicioConsultorio" ? value : value.toUpperCase(),
    }));
  };

  const saveConsultorio = async (event: FormEvent) => {
    event.preventDefault();
    if (!record) return;
    setError("");
    setLoading(true);
    try {
      const currentConsultorios = record.consultorios?.length
        ? record.consultorios
        : record.trabajaConsultorio === "SI" &&
            (record.domicilioConsultorio ||
              record.numeracionConsultorio ||
              record.ciudadConsultorio)
          ? [
              {
                domicilio: record.domicilioConsultorio || "",
                numeracion: record.numeracionConsultorio || "",
                ciudad: record.ciudadConsultorio || "",
                esTitularConsultorio: record.esTitularConsultorio,
                esProfesionalAdjunto: record.esProfesionalAdjunto,
                nombreTitularConsultorio: record.nombreTitularConsultorio,
                fechaInicioConsultorio: record.fechaInicioConsultorio,
                numeroMatriculaConsultorio: record.numeroMatriculaConsultorio,
              },
            ]
          : [];
      if (currentConsultorios.length >= 4) {
        setError("Ya cuenta con el máximo de cuatro consultorios registrados.");
        return;
      }
      const saved = await memberAddConsultorio(consultorio);
      setRecord(normalizeRecord(saved));
      setConsultorio(EMPTY_CONSULTORIO);
      setScreen("dashboard");
      setMessage(
        "El consultorio fue dado de alta y enviado a administración para su revisión.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo dar de alta el consultorio.",
      );
    } finally {
      setLoading(false);
    }
  };
  const manageAttachedProfessional = async (action: "associate" | "remove", matricula: string, consultorioSolicitudId?: string) => {
    if (!record) return;
    const searchValue = String(matricula || "").trim();
    let normalizedMatricula = onlyDigits(searchValue);
    if (!searchValue) { setError("Ingrese un ID, DNI o matrícula válida."); return; }
    if (action === "associate") {
      try {
        const candidate = await lookupServerRecord(searchValue);
        normalizedMatricula = onlyDigits(String(candidate?.matricula || ""));
        if (!normalizedMatricula) throw new Error("El registro encontrado no tiene una matrícula válida.");
        const yes = (value: unknown) =>
          ["SI", "SÍ", "YES", "TRUE", "1"].includes(String(value ?? "").trim().toUpperCase());
        const consultorioAdjunto = Array.isArray(candidate?.consultorios)
          && candidate.consultorios.some((item) =>
            String(item?.esTitularConsultorio || "").trim().toUpperCase() === "NO"
            && yes(item?.esProfesionalAdjunto),
          );
        const esAdjuntoValido = yes(candidate?.esProfesionalAdjunto)
          || yes(candidate?.formularioHabilitacionConsultorio?.esProfesionalAdjunto)
          || consultorioAdjunto;
        if (!esAdjuntoValido) {
          setAttachedActionErrorByRequest((current) => ({
            ...current,
            [consultorioSolicitudId || "principal"]: "MATRÍCULA NO CORRESPONDE A UN PROFESIONAL ADJUNTO",
          }));
          return;
        }
      } catch (lookupError) {
        setAttachedActionErrorByRequest((current) => ({
          ...current,
          [consultorioSolicitudId || "principal"]: lookupError instanceof Error
            ? lookupError.message
            : "MATRÍCULA NO CORRESPONDE A UN PROFESIONAL ADJUNTO",
        }));
        return;
      }
    }
    if (action === "associate") {
      const targetForm = consultorioSolicitudId
        ? record.consultorioSolicitudes?.find((request) => request.id === consultorioSolicitudId)?.formularioHabilitacionConsultorio
        : record.formularioHabilitacionConsultorio;
      const associatedMatriculas = ["", ...Array.from({ length: 7 }, (_, index) => String(index + 2))]
        .map((suffix) => onlyDigits(String(targetForm?.[`adjuntoMatricula${suffix}`] || "")))
        .filter(Boolean);
      if (associatedMatriculas.includes(normalizedMatricula)) {
        window.alert("COLEGIADO ADJUNTO FUE AGREGADO A ESTE CONSULTORIO");
        return;
      }
    }
    if (action === "associate" && normalizedMatricula === onlyDigits(String(record.matricula || ""))) {
      setAttachedActionErrorByRequest((current) => ({ ...current, [consultorioSolicitudId || "principal"]: "No puede asociarse a sí mismo." }));
      return;
    }
    if (action === "remove" && !window.confirm("¿Desasociar este profesional del Alta de consultorio?")) return;
    setAttachedActionLoading(action + ":" + (consultorioSolicitudId || "principal") + ":" + normalizedMatricula);
    setError("");
    try {
      const saved = await memberManageAttached(action, normalizedMatricula, consultorioSolicitudId);
      const savedRecord = normalizeRecord(saved);
      const savedForm = consultorioSolicitudId
        ? savedRecord.consultorioSolicitudes?.find((request) => request.id === consultorioSolicitudId)?.formularioHabilitacionConsultorio || {}
        : savedRecord.formularioHabilitacionConsultorio || {};
      const certificateAlreadyIssued = savedForm.estadoAdmin === "APROBADO"
        || savedForm.validadoAdmin === true;
      let finalRecord = savedRecord;
      if (certificateAlreadyIssued && (savedForm.certificadoUrl || savedForm.certificadoConsultorioUrl)) {
        const refreshed = generateAutomaticCertificates({
          ...savedRecord,
          consultorioSolicitudId,
          formularioHabilitacionConsultorio: savedForm,
        });
        finalRecord = normalizeRecord(await memberSaveRecord({
          ...savedRecord,
          consultorioSolicitudId,
          formularioHabilitacionConsultorio: {
            ...savedForm,
            certificadoNombre: refreshed.consultorioNombre,
            certificadoUrl: refreshed.consultorioUrl,
            certificadoConsultorioNombre: refreshed.consultorioNombre,
            certificadoConsultorioUrl: refreshed.consultorioUrl,
            certificadoEticaNombre: refreshed.eticaNombre,
            certificadoEticaUrl: refreshed.eticaUrl,
            certificadoVigenciaDesde: refreshed.vigenciaDesde,
            certificadoVigenciaHasta: refreshed.vigenciaHasta,
          },
        } as unknown as DeclarationData));
      }
      setRecord(finalRecord);      setAttachedSearchMatricula("");
      if (consultorioSolicitudId) setAttachedSearchByRequest((current) => ({ ...current, [consultorioSolicitudId]: "" }));
      setAttachedActionErrorByRequest((current) => ({ ...current, [consultorioSolicitudId || "principal"]: "" }));
      setMessage(action === "associate" ? "Profesional adjunto asociado correctamente." : "Profesional adjunto desasociado correctamente.");
    } catch (actionError) {
      const actionMessage = actionError instanceof Error ? actionError.message : "No se pudo actualizar la asociacion.";
      if (action === "associate" && /ya est.{0,4} asociado|COLEGIADO ADJUNTO FUE AGREGADO/i.test(actionMessage)) {
        window.alert("COLEGIADO ADJUNTO FUE AGREGADO A ESTE CONSULTORIO");
      }
      setAttachedActionErrorByRequest((current) => ({ ...current, [consultorioSolicitudId || "principal"]: actionMessage }));
    } finally {
      setAttachedActionLoading("");
    }
  };
  const expiryDate = record?.fechaVencimiento
    ? parseDateOnly(record.fechaVencimiento)
    : null;
  const presentationDate = record?.fechaPresentacion
    ? parseDateOnly(record.fechaPresentacion)
    : null;
  // The automatic two-year expiry is based on the local presentation date.
  // Older records could contain the previous UTC-derived date (one day early).
  const automaticExpiryDate = presentationDate
    ? new Date(
        presentationDate.getFullYear() + 2,
        presentationDate.getMonth(),
        presentationDate.getDate(),
      )
    : null;
  const cardExpiryDate =
    expiryDate &&
    automaticExpiryDate &&
    Math.abs(expiryDate.getTime() - automaticExpiryDate.getTime()) <= 86400000
      ? automaticExpiryDate
      : expiryDate;
  const expired = expiryDate
    ? new Date(
        expiryDate.getFullYear(),
        expiryDate.getMonth(),
        expiryDate.getDate(),
        23,
        59,
        59,
      ) < new Date()
    : false;
  const formattedExpiry = cardExpiryDate
    ? cardExpiryDate.toLocaleDateString("es-AR")
    : "sin fecha registrada";
  const formattedPresentation = formatDateOnly(record?.fechaPresentacion);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDay = expiryDate;
  const daysToExpiry = expiryDay
    ? Math.round((expiryDay.getTime() - today.getTime()) / 86400000)
    : null;
  const expiryDetail =
    daysToExpiry === null
      ? "Sin fecha de vencimiento"
      : daysToExpiry < 0
        ? `${Math.abs(daysToExpiry)} día${Math.abs(daysToExpiry) === 1 ? "" : "s"} vencido${Math.abs(daysToExpiry) === 1 ? "" : "s"}`
        : daysToExpiry === 0
          ? "Vence hoy"
          : `${daysToExpiry} día${daysToExpiry === 1 ? "" : "s"} restantes`;

  const activeConsultorioCities = Array.from(
    new Set(
      (record?.consultorios || [])
        .map((consultorio) => consultorio.ciudad ? normalizeMisionesLocality(consultorio.ciudad) : "")
        .filter((city): city is string => Boolean(city)),
    ),
  );
  const activeConsultorioCount =
    record?.trabajaConsultorio === "SI"
      ? Math.max(
          activeConsultorioCities.length,
          record?.cantidadConsultorios || 0,
        )
      : 0;
  const getAttachedProfessionalsForForm = (form: Record<string, string | boolean | undefined | unknown[]>) => ["", ...Array.from({ length: 7 }, (_, index) => String(index + 2))].map((suffix) => {
    const matricula = String(form[`adjuntoMatricula${suffix}`] || "").trim();
    if (!matricula) return null;
    return {
      matricula,
      apellido: String(form[`adjuntoApellido${suffix}`] || ""),
      nombres: String(form[`adjuntoNombres${suffix}`] || ""),
      dni: String(form[`adjuntoDni${suffix}`] || ""),
      titulo: String(form[`adjuntoTitulo${suffix}`] || ""),
      fotoUrl: String(form[`adjuntoFotoUrl${suffix}`] || ""),
    };
  }).filter(Boolean) as Array<{ matricula: string; apellido: string; nombres: string; dni: string; titulo: string; fotoUrl: string }>;

  const renderAttachedManager = (request: { id: string; formularioHabilitacionConsultorio?: Record<string, string | boolean | undefined | unknown[]> }) => {
    const form = request.formularioHabilitacionConsultorio || {};
    const attached = getAttachedProfessionalsForForm(form);
    const requestKey = request.id;
    const search = attachedSearchByRequest[requestKey] || "";
    const requestId = request.id === "principal" ? undefined : request.id;
    const attachedActionError = attachedActionErrorByRequest[requestKey] || "";
    return (
      <section className="cokifimi-attached-professionals cokifimi-member-attached-professionals" aria-label="Profesionales adjuntos a cargo">
        <small>Profesionales adjuntos asociados · {attached.length}/8</small>
        {attachedActionError && <div className="cokifimi-member-attached-error" role="alert">{attachedActionError}</div>}
        <div className="cokifimi-attached-professionals-manage">
          <input value={search} onChange={(event) => setAttachedSearchByRequest((current) => ({ ...current, [requestKey]: event.target.value }))} inputMode="text" placeholder="ID, DNI o matrícula del adjunto" aria-label="ID, DNI o matrícula del profesional adjunto" />
          <button type="button" disabled={Boolean(attachedActionLoading) || !search.trim() || attached.length >= 8} onClick={() => void manageAttachedProfessional("associate", search, requestId)}>
            {attachedActionLoading === `associate:${requestKey}:${onlyDigits(search)}` ? <LoaderCircle className="animate-spin" /> : <Link2 />} Asociar profesional
          </button>
        </div>
        <div className={`cokifimi-attached-professionals-list ${attached.length === 1 ? "is-single" : ""}`}>
          {attached.map((professional) => (
            <div key={`${requestKey}-${professional.matricula}`} className="cokifimi-attached-professional">
              <div className="cokifimi-attached-professional-photo">{professional.fotoUrl ? <img src={professional.fotoUrl} alt={`Foto de ${professional.nombres} ${professional.apellido}`} /> : <UserRound />}</div>
              <div>
                <strong>{professional.apellido}, {professional.nombres}</strong>
                <span>M.P. {professional.matricula}{professional.dni ? ` · DNI ${professional.dni}` : ""}</span>
                {professional.titulo && <em>{professional.titulo}</em>}
                <button type="button" className="cokifimi-attached-professional-remove" disabled={Boolean(attachedActionLoading)} onClick={() => void manageAttachedProfessional("remove", professional.matricula, requestId)}>
                  {attachedActionLoading === `remove:${requestKey}:${onlyDigits(professional.matricula)}` ? <LoaderCircle className="animate-spin" /> : <Unlink />} Desasociar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const consultorioRequests = [
    ...(record?.formularioHabilitacionConsultorio?.submittedAt ? [{ id: "principal", formularioHabilitacionConsultorio: record.formularioHabilitacionConsultorio }] : []),
    ...(record?.consultorioSolicitudes || []),
  ];
  const sortedConsultorioRequests = [...consultorioRequests].sort((left, right) => {
    const leftIsPrincipal = left.id === "principal";
    const rightIsPrincipal = right.id === "principal";
    if (leftIsPrincipal && !rightIsPrincipal) return -1;
    if (!leftIsPrincipal && rightIsPrincipal) return 1;
    const leftLocation = [
      left.formularioHabilitacionConsultorio?.domicilioConsultorio,
      left.formularioHabilitacionConsultorio?.numeroConsultorio,
      left.formularioHabilitacionConsultorio?.localidadConsultorio,
    ].filter(Boolean).join(" ").trim().toLowerCase();
    const rightLocation = [
      right.formularioHabilitacionConsultorio?.domicilioConsultorio,
      right.formularioHabilitacionConsultorio?.numeroConsultorio,
      right.formularioHabilitacionConsultorio?.localidadConsultorio,
    ].filter(Boolean).join(" ").trim().toLowerCase();
    return leftLocation.localeCompare(rightLocation, "es-AR");
  });
  const canRequestAnotherConsultorio = sortedConsultorioRequests.length < 3;
  const consultorioSubmittedAt =
    record?.formularioHabilitacionConsultorio?.submittedAt;
  const rawLibreDeudaSolicitud = record?.libreDeudaSolicitud;
  // Algunas declaraciones antiguas conservan un objeto vacío o incompleto.
  // No debe bloquear una nueva solicitud si no hay estado y fecha válidos.
  const libreDeudaSolicitud = rawLibreDeudaSolicitud
    && typeof rawLibreDeudaSolicitud.submittedAt === "string"
    && Boolean(rawLibreDeudaSolicitud.submittedAt)
    && ["PENDIENTE", "APROBADO", "RECHAZADO"].includes(String(rawLibreDeudaSolicitud.estado || "").toUpperCase())
    ? rawLibreDeudaSolicitud
    : undefined;
  const trabajaEnConsultorio = record?.trabajaConsultorio === "SI";
  // Todo colegiado con acceso confirmado puede solicitar Libre Deuda.
  // La disponibilidad no depende de fechas históricas de la declaración bianual.
  const libreDeudaPuedeSolicitar = Boolean(record);
  const libreDeudaVenceAt = (() => {
    if (!libreDeudaSolicitud || libreDeudaSolicitud.estado !== "APROBADO") return "";
    const approvalDate = libreDeudaSolicitud.revisadoAt || libreDeudaSolicitud.submittedAt;
    if (!approvalDate) return "";
    const expiry = new Date(approvalDate);
    expiry.setDate(expiry.getDate() + 60);
    expiry.setHours(23, 59, 59, 999);
    return expiry.toISOString();
  })();
  const libreDeudaVencida = Boolean(libreDeudaVenceAt && new Date(libreDeudaVenceAt).getTime() < Date.now());
  const libreDeudaVigenciaEstado = (() => {
    if (!libreDeudaVenceAt) return "";
    const days = Math.ceil((new Date(libreDeudaVenceAt).getTime() - Date.now()) / 86400000) - 1;
    return days < 0 ? "vencido" : days <= 7 ? "por-vencer" : "vigente";
  })();
  const libreDeudaVigenciaDetalle = (() => {
    if (!libreDeudaVenceAt) return "";
    const days = Math.ceil((new Date(libreDeudaVenceAt).getTime() - Date.now()) / 86400000) - 1;
    if (days < 0) return "La vigencia finalizó";
    if (days === 0) return "Vence hoy";
    return libreDeudaVigenciaEstado === "por-vencer" ? `Vence en ${days} día${days === 1 ? "" : "s"}` : `Restan ${days} días`;
  })();
  const solicitarLibreDeuda = async () => {
    if (!record || !libreDeudaPuedeSolicitar) return;
    await saveRecord({
      id: record.id,
      dni: record.dni,
      libreDeudaSolicitud: { id: "libre_deuda_" + Date.now(), submittedAt: new Date().toISOString(), estado: "PENDIENTE" },
    } as unknown as DeclarationData);
  };
  const reenviarLibreDeuda = async () => {
    if (!record || !libreDeudaSolicitud || libreDeudaSolicitud.estado !== "RECHAZADO" || !libreDeudaPuedeSolicitar) return;
    await saveRecord({
      id: record.id,
      dni: record.dni,
      libreDeudaSolicitud: {
        ...libreDeudaSolicitud,
        submittedAt: new Date().toISOString(),
        estado: "PENDIENTE",
        mensajeAdmin: "",
        revisadoAt: "",
        certificadoUrl: "",
        certificadoNombre: "",
      },
    } as unknown as DeclarationData);
  };
  const reenviarLibreDeudaConComprobante = async (file?: File) => {
    if (file && file.size > 5 * 1024 * 1024) { setError("El comprobante no puede superar 5 MB."); return; }
    if (!file || !record || !libreDeudaSolicitud || libreDeudaSolicitud.estado !== "RECHAZADO" || !libreDeudaPuedeSolicitar) return;
    try {
      const comprobante = await readPaymentFile(file);
      await saveRecord({
        id: record.id,
      dni: record.dni,
        libreDeudaSolicitud: {
          ...libreDeudaSolicitud,
          submittedAt: new Date().toISOString(),
          estado: "PENDIENTE",
          mensajeAdmin: "",
          revisadoAt: "",
          certificadoUrl: "",
          certificadoNombre: "",
          comprobanteColegiadoUrl: comprobante.url,
          comprobanteColegiadoNombre: comprobante.name,
        },
      } as unknown as DeclarationData);
    } catch {
      setError("No se pudo adjuntar el comprobante de pago.");
    }
  };  const descargarLibreDeuda = () => {
    if (!record || libreDeudaSolicitud?.estado !== "APROBADO") return;
    let certificadoUrl = libreDeudaSolicitud.certificadoUrl || "";
    let certificadoNombre = libreDeudaSolicitud.certificadoNombre || `Certificado_Libre_Deuda_${record.dni}.pdf`;
    if (!certificadoUrl) {
      const generado = generateAutomaticCertificates(record);
      certificadoUrl = generado.eticaUrl;
      certificadoNombre = generado.eticaNombre || certificadoNombre;
    }
    if (!certificadoUrl) { setError("No se pudo generar el certificado de Libre Deuda."); return; }
    const link = document.createElement("a");
    link.href = certificadoUrl;
    link.download = certificadoNombre;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const descargarComprobanteLibreDeuda = () => {
    if (!libreDeudaSolicitud?.comprobantePagoUrl) { setError("El comprobante de pago todavía no está disponible."); return; }
    const link = document.createElement("a");
    link.href = libreDeudaSolicitud.comprobantePagoUrl;
    link.download = libreDeudaSolicitud.comprobantePagoNombre || `Comprobante_Pago_Libre_Deuda_${record?.dni || ""}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const consultorioRejected =
    record?.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO";
  const consultorioValidated =
    !consultorioRejected && record?.formularioHabilitacionConsultorio?.validadoAdmin === true;
  const consultorioResent = Boolean(
    record?.formularioHabilitacionConsultorio?.reenvioAt,
  );
  const consultorioAdminMessage =
    record?.formularioHabilitacionConsultorio?.mensajeAdmin;
  const consultorioCertificateUrl =
    record?.formularioHabilitacionConsultorio?.certificadoUrl;
  const consultorioCertificateName =
    record?.formularioHabilitacionConsultorio?.certificadoNombre;
  const consultorioCertificateEticaUrl =
    record?.formularioHabilitacionConsultorio?.certificadoEticaUrl;
  const consultorioCertificateEticaName =
    record?.formularioHabilitacionConsultorio?.certificadoEticaNombre;
  const consultorioReceiptUrl =
    record?.formularioHabilitacionConsultorio?.reciboPagoArchivo;
  const consultorioReceiptName =
    record?.formularioHabilitacionConsultorio?.reciboPagoNombre;
  const consultorioForm = record?.formularioHabilitacionConsultorio || {};
  const consultorioRequestedLocation = [
    consultorioForm.domicilioConsultorio,
    consultorioForm.numeroConsultorio,
    consultorioForm.localidadConsultorio,
  ].filter(Boolean).join(" ");
  const consultorioValidityFrom = consultorioForm.certificadoVigenciaDesde || consultorioForm.validadoAt || consultorioForm.submittedAt;
  const consultorioValidityTo = consultorioForm.certificadoVigenciaHasta || (() => {
    if (!consultorioValidityFrom || !consultorioValidated) return '';
    const months = Number(String(consultorioForm.mesesHabilitacion || consultorioForm.periodoHabilitacion || '').match(/6|12|24/)?.[0] || 6);
    const date = parseDateOnly(String(consultorioValidityFrom));
    date.setMonth(date.getMonth() + months);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();
  const consultorioValidityDays = consultorioValidityTo && consultorioValidated ? Math.ceil((parseDateOnly(String(consultorioValidityTo)).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000) : null;
  const consultorioPaymentStatus = String(
    record?.formularioHabilitacionConsultorio?.estadoPago || "",
  );

  const consultorioCertificateHref = typeof consultorioCertificateUrl === 'string' ? consultorioCertificateUrl : undefined;
  const consultorioCertificateEticaHref = typeof consultorioCertificateEticaUrl === 'string' ? consultorioCertificateEticaUrl : undefined;
  const consultorioReceiptHref = typeof consultorioReceiptUrl === 'string' ? consultorioReceiptUrl : undefined;
  const consultorioAmountStatus = String(
    record?.formularioHabilitacionConsultorio?.estadoImporte || "",
  );
  const consultorioCurrentStatus = consultorioValidated
    ? "Solicitud aprobada"
    : consultorioRejected
      ? "Solicitud rechazada"
      : consultorioPaymentStatus === "COMPROBANTE_RECIBIDO"
        ? "Comprobante recibido · en verificación"
        : consultorioPaymentStatus === "PAGO_VALIDADO"
          ? "Pago validado · pendiente de aprobación"
        : consultorioAmountStatus === "IMPORTE_CONFIRMADO"
          ? "Esperando pago"
          : "Pendiente de revisión";
  const consultorioPaymentInstructionText = consultorioAmountStatus === "IMPORTE_CONFIRMADO"
    ? "Debe abonar este importe al Colegio y subir el comprobante para validar el pago. Los certificados de alta se emitirán una vez verificado."
    : "Todavía no realice el pago. Aguarde a que la Administración confirme el importe definitivo.";
  const consultorioPaymentStatusMessage = consultorioPaymentStatus === "COMPROBANTE_RECIBIDO"
    ? "COMPROBANTE ENVIADO Y EN ESPERA DE ALTA"
    : consultorioPaymentStatus === "PAGO_VALIDADO"
      ? "Pago validado por administración."
      : consultorioAmountStatus !== "IMPORTE_CONFIRMADO"
        ? "Aguarde la confirmación del importe para abonar e informar el comprobante desde acá."
        : "Adjunte el comprobante original para continuar.";
  const consultorioProgress = (
    <div
      className={`cokifimi-member-consultorio-progress ${consultorioRejected ? "is-rejected" : consultorioValidated ? "is-approved" : ""}`}
    >
      <div className="cokifimi-member-consultorio-progress-heading">
        <strong>Seguimiento del trámite</strong>
        <span>{consultorioCurrentStatus}</span>
      </div>
      <div className="cokifimi-member-consultorio-progress-steps">
        <div className="is-done">
          <b>1</b>
          <span>Solicitud presentada</span>
        </div>
        <div
          className={
            consultorioAmountStatus === "IMPORTE_CONFIRMADO" ? "is-done" : ""
          }
        >
          <b>2</b>
          <span>Importe confirmado</span>
        </div>
        <div
          className={
            consultorioPaymentStatus === "COMPROBANTE_RECIBIDO" ||
            consultorioPaymentStatus === "PAGO_VALIDADO"
              ? "is-done"
              : ""
          }
        >
          <b>3</b>
          <span>Comprobante recibido</span>
        </div>
        <div className={consultorioValidated ? "is-done" : ""}>
          <b>4</b>
          <span>Alta y certificados</span>
        </div>
      </div>
    </div>
  );
  const consultorioPaymentPanel = consultorioSubmittedAt && !consultorioValidated ? (() => { if (consultorioRejected) return <section className="cokifimi-member-payment-panel cokifimi-member-payment-panel-rejected" aria-label="Comprobante bloqueado por rechazo"><strong>COMPROBANTE BLOQUEADO</strong><span>Esta solicitud fue rechazada por Administración.</span><small>Edite y vuelva a enviar el alta para continuar. No puede adjuntar un comprobante hasta que sea reenviada.</small></section>;
    const form = record?.formularioHabilitacionConsultorio || {};
    const amountConfirmed = consultorioAmountStatus === "IMPORTE_CONFIRMADO";
    const amount = Number(form.importeConfirmado || 0);
    const canUpload = amountConfirmed && consultorioPaymentStatus !== "COMPROBANTE_RECIBIDO" && consultorioPaymentStatus !== "PAGO_VALIDADO";
    return <section className={`cokifimi-member-payment-panel ${!amountConfirmed ? "is-awaiting-amount" : ""}`} aria-label="Importe y datos bancarios">
      {!amountConfirmed ? <div><strong className="cokifimi-member-awaiting-title">Aguarde el monto a pagar</strong><span>La Administración confirmará el importe definitivo.</span><small>El monto aparecerá aquí en su panel para que pueda abonarlo por transferencia.</small><p className="cokifimi-member-payment-instruction">{consultorioPaymentInstructionText}</p></div> : <>
        <div><span>Importe de habilitación</span><small>Importe confirmado por Administración</small><strong>$ {amount.toLocaleString("es-AR")}</strong></div>
        <div className="cokifimi-member-bank-details"><strong>*Home Banking</strong><span>*Banco De La Nación Argentina- Sucursal Posadas</span><span>CBU: 0110407720040712036177</span><span>Alias: cokifimi</span><span>Cuenta corriente en Pesos: N°40712036/17</span><span>Cuit: 30-67238903-4</span></div>
        <div className="cokifimi-member-payment-warning"><strong>Importante</strong><span>Adjunte el comprobante ORIGINAL y envíelo. En el comprobante se debe ver la fecha de la transacción, CBU 0110407720040712036177 o Cuenta corriente en Pesos N°4071203617 del Colegio y el monto abonado. Si no se puede apreciar alguno de estos detalles, el comprobante se considera nulo y no se acredita.</span></div>
        <p className="cokifimi-member-payment-instruction">{consultorioPaymentInstructionText}</p>
        {canUpload ? <>
  <label className="cokifimi-member-payment-upload">Seleccionar comprobante original<input type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void readPaymentFile(file).then((preparedFile) => setPendingPaymentFile(preparedFile)); }} /></label>
  {pendingPaymentFile && <div className="cokifimi-member-payment-preview"><strong>Vista previa: {pendingPaymentFile.name}</strong>{pendingPaymentFile.url.startsWith("data:image/") ? <img src={pendingPaymentFile.url} alt="Vista previa del comprobante" /> : <iframe src={pendingPaymentFile.url} title="Vista previa del comprobante" />}<div><button type="button" disabled={paymentSending || paymentSent} onClick={async () => { setPaymentNotice("sending"); setPaymentSending(true); const paymentRequestId = resolveConsultorioPaymentRequestId(record, undefined, form); const sent = await saveRecord({ id: record!.id, consultorioSolicitudId: paymentRequestId, formularioHabilitacionConsultorio: { ...form, nuevaSolicitudConsultorio: undefined, comprobantePagoArchivo: pendingPaymentFile.url, comprobantePagoNombre: pendingPaymentFile.name, estadoPago: "COMPROBANTE_RECIBIDO", comprobantePagoAt: new Date().toISOString() } } as unknown as DeclarationData); setPaymentSending(false); if (sent) { setPaymentSent(true); setPaymentNotice("sent"); setMessage("Comprobante enviado correctamente."); } else { setPaymentNotice(null); } }}>{paymentSending ? <><LoaderCircle className="cokifimi-payment-spinner" size={16} /> Enviando...</> : paymentSent ? "✓ Enviado" : "Enviar comprobante"}</button><button type="button" disabled={paymentSending} onClick={() => setPendingPaymentFile(null)}>Elegir otro archivo</button></div></div>}
</> : <p>{consultorioPaymentStatusMessage}</p>}
      </>}
    </section>;
  })() : null;
  const consultorioValidityPanel = consultorioValidated && consultorioValidityTo ? <div className="cokifimi-member-consultorio-validity" aria-label="Vigencia de la habilitación"><div><CalendarDays /><span>Vigencia desde</span><strong>{formatDateOnly(String(consultorioValidityFrom || ''))}</strong></div><div><CalendarDays /><span>Vencimiento</span><strong>{formatDateOnly(String(consultorioValidityTo))}</strong></div><div className="is-highlight"><CalendarDays /><span>Vigencia</span><strong>{consultorioValidityDays !== null && consultorioValidityDays < 0 ? 'Vencida' : `${consultorioValidityDays} días restantes`}</strong></div></div> : null;

  if (screen === "form")
    return (
      <section className="cokifimi-member-form-shell" style={{ width: "100vw", maxWidth: "none", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" }}>
        <div className="cokifimi-member-form-return">
          <button
            type="button"
            onClick={() => {
              setPendingRecord(null);
              setScreen("dashboard");
            }}
          >
            <ArrowLeft /> Volver al panel del colegiado
          </button>
        </div>
        <FormWizard
          initialData={
            record
              ? record.memberProvisional
                ? { ...record, apellido: "", nombres: "" }
                : record
              : { ...INITIAL_DECLARATION, id: "" }
          }
          onSave={saveRecord}
          onReview={(data) => {
            const editableData = record && !record.memberProvisional
              ? { ...data, formularioHabilitacionConsultorio: undefined }
              : data;
            setPendingRecord(editableData);
            setScreen("preview");
          }}
          onCancel={() => {
            setPendingRecord(null);
            setScreen("dashboard");
          }}
          readOnlyDates={false}
          memberInfoOnly={Boolean(record && !record.memberProvisional)}
          lockedEmail
          showMatriculationAdminNotice
          hideMatriculationDate
        />
      </section>
    );
  if (screen === "preview" && (pendingRecord || record))
    return (
      <div className="cokifimi-app">
        <DeclarationPreview
        data={pendingRecord || record!}
        isPendingSave={Boolean(pendingRecord)}
        onConfirmSave={() => {
          if (pendingRecord) void saveRecord(pendingRecord);
        }}
        onEdit={undefined}
        onBack={() => {
          setPendingRecord(null);
          setScreen("dashboard");
        }}
        backLabel="Inicio del panel"
      />
      </div>
    );
  const primaryConsultorioRejected = Boolean(
    record?.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO",
  );
  const consultorioEditRequestId = record
    ? (addingConsultorio ? null : newConsultorioRequestId
      || record.consultorioSolicitudId
      || (!primaryConsultorioRejected
        ? resolveConsultorioPaymentRequestId(record, undefined, record.formularioHabilitacionConsultorio || {})
        : null)
      || null)
    : null;
  const consultorioEditIsExisting = Boolean(consultorioEditRequestId && (record?.consultorioSolicitudId === consultorioEditRequestId || record?.consultorioSolicitudes?.some((request) => request.id === consultorioEditRequestId)));  if (screen === "consultorio" && record)
    return (
      <ConsultorioHabilitacionForm
        record={consultorioEditRequestId && !consultorioEditIsExisting ? { ...record, formularioHabilitacionConsultorio: undefined, consultorioSolicitudId: consultorioEditRequestId } : record}
        excludedConsultorioAddresses={addingConsultorio ? newConsultorioBlockedAddresses : consultorioEditRequestId && !consultorioEditIsExisting ? consultorioRequests.map((request) => { const form = request.formularioHabilitacionConsultorio || {}; return `${form.domicilioConsultorio || ""} ${form.numeroConsultorio || ""} ${form.localidadConsultorio || ""}`.trim(); }).filter(Boolean) : []}
        onReview={(data) => {
          const requestId = consultorioEditRequestId || data.consultorioSolicitudId || (addingConsultorio ? `alta_${Date.now()}` : null);
          const editingPrimaryRequest = !requestId && Boolean(record.formularioHabilitacionConsultorio?.submittedAt);
          const existingRequest = editingPrimaryRequest || Boolean(requestId && (record.consultorioSolicitudId === requestId || record.consultorioSolicitudes?.some((request) => request.id === requestId)));
          setPendingConsultorioRecord(requestId ? {
            ...data,
            consultorioSolicitudId: requestId,
            formularioHabilitacionConsultorio: {
              ...(data.formularioHabilitacionConsultorio || {}),
              nuevaSolicitudConsultorio: existingRequest ? undefined : true,
              consultorioSolicitudId: requestId,
              ...(existingRequest ? {
                estadoAdmin: "PENDIENTE",
                validadoAdmin: false,
                estadoImporte: "PENDIENTE_VERIFICACION",
                estadoPago: "SIN_COMPROBANTE",
                validadoAt: "",
                rechazadoAt: "",
                resueltoAt: "",
                importeConfirmado: "",
                importeEstimado: "",
                importeConfirmadoAt: "",
                certificadoVigenciaDesde: "",
                certificadoVigenciaHasta: "",
                comprobantePagoArchivo: "",
                comprobantePagoNombre: "",
                reciboPagoArchivo: "",
                reciboPagoNombre: "",
                pagoValidadoAt: "",
                historialSolicitud: [
                  ...(Array.isArray((record.formularioHabilitacionConsultorio as Record<string, unknown>).historialSolicitud) ? (record.formularioHabilitacionConsultorio as Record<string, unknown>).historialSolicitud as unknown[] : []),
                  consultorioHistorySnapshot(record.formularioHabilitacionConsultorio as Record<string, unknown>),
                ],
                reenvioAt: undefined,
                mensajeAdmin: "",
                descripcionCertificado: "",
                certificadoNombre: "",
                certificadoUrl: "",
                certificadoEticaNombre: "",
                certificadoEticaUrl: "",
              } : {}),
            },
          } : editingPrimaryRequest ? {
            ...data,
            formularioHabilitacionConsultorio: {
              ...(data.formularioHabilitacionConsultorio || {}),
              estadoAdmin: "PENDIENTE",
              validadoAdmin: false,
              validadoAt: "",
              rechazadoAt: "",
              resueltoAt: "",
              estadoImporte: "PENDIENTE_VERIFICACION",
              estadoPago: "SIN_COMPROBANTE",
              importeConfirmado: "",
              importeEstimado: "",
              importeConfirmadoAt: "",
              certificadoVigenciaDesde: "",
              certificadoVigenciaHasta: "",
              comprobantePagoArchivo: "",
              comprobantePagoNombre: "",
              reciboPagoArchivo: "",
              reciboPagoNombre: "",
              pagoValidadoAt: "",
              historialSolicitud: [
                ...(Array.isArray((record.formularioHabilitacionConsultorio as Record<string, unknown>)?.historialSolicitud) ? (record.formularioHabilitacionConsultorio as Record<string, unknown>).historialSolicitud as unknown[] : []),
                consultorioHistorySnapshot(record.formularioHabilitacionConsultorio as Record<string, unknown>),
              ],
              reenvioAt: undefined,
              mensajeAdmin: "",
              descripcionCertificado: "",
              certificadoNombre: "",
              certificadoUrl: "",
              certificadoEticaNombre: "",
              certificadoEticaUrl: "",
            },          } : addingConsultorio ? { ...data, formularioHabilitacionConsultorio: { ...(data.formularioHabilitacionConsultorio || {}), nuevaSolicitudConsultorio: true } } : data);
          setScreen("consultorio-preview");
        }}
        onCancel={() => {
          setConsultorio(EMPTY_CONSULTORIO);
          setNewConsultorioRequestId(null);
          setAddingConsultorio(false);
          setNewConsultorioBlockedAddresses([]);
          setScreen("dashboard");
        }}
        saving={loading}
        forceNewConsultorio={addingConsultorio}
      />
    );
  if (screen === "consultorio-preview" && pendingConsultorioRecord)
    return (
      <>
      <ConsultorioHabilitacionPreview
        data={pendingConsultorioRecord}
        onEdit={() => {
          setRecord(pendingConsultorioRecord);
          setNewConsultorioRequestId(pendingConsultorioRecord.consultorioSolicitudId || null);
          setScreen("consultorio");
        }}
        onConfirm={() => {
          const form =
            pendingConsultorioRecord.formularioHabilitacionConsultorio || {};
          const months = Number(
            String(form.periodoHabilitacion || "").match(/6|12|24/)?.[0] || 6,
          );
          const hasRejectedHistory = Array.isArray(form.historialSolicitud)
            && form.historialSolicitud.some((entry) => String((entry as Record<string, unknown>)?.estadoAdmin || "") === "RECHAZADO");
          const isRejectedResubmission = hasRejectedHistory && form.estadoAdmin === "PENDIENTE";
          void saveRecord({
            ...pendingConsultorioRecord,
            formularioHabilitacionConsultorio: {
              ...form,
              submittedAt: new Date().toISOString(),
              estadoAdmin: "PENDIENTE",
              estadoImporte: isRejectedResubmission ? "PENDIENTE_VERIFICACION" : form.estadoImporte === "IMPORTE_CONFIRMADO" ? "IMPORTE_CONFIRMADO" : "PENDIENTE_VERIFICACION",
              estadoPago: "SIN_COMPROBANTE",
              mesesHabilitacion: String(months),
              validadoAdmin: false,
              validadoAt: undefined,
              reenvioAt:
                form.estadoAdmin === "RECHAZADO"
                  ? new Date().toISOString()
                  : form.reenvioAt,
              mensajeAdmin: "",
              certificadoNombre: "",
              certificadoUrl: "",
              certificadoEticaNombre: "",
              certificadoEticaUrl: "",
            },
          });
        }}
        onCancel={() => {
          setPendingConsultorioRecord(null);
          setNewConsultorioRequestId(null);
          setAddingConsultorio(false);
          setNewConsultorioBlockedAddresses([]);
          setScreen("dashboard");
        }}
        saving={loading}
      />
        {loading && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="saving-consultorio-title">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
              <LoaderCircle className="cokifimi-payment-spinner mx-auto h-12 w-12 text-emerald-700" />
              <h2 id="saving-consultorio-title" className="mt-5 text-xl font-extrabold text-slate-900">Aguarde, guardando alta</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Estamos guardando la solicitud y sus archivos adjuntos. No cierre esta ventana.</p>
            </div>
          </div>
        )}
      </>
    );
  if (
    screen === "consultorio-view" &&
    record?.formularioHabilitacionConsultorio?.submittedAt
  )
    return (
      <>
        <ConsultorioHabilitacionPreview
          data={record}
          onCancel={() => setScreen("dashboard")}
          onPaymentSubmit={(file, name) =>
            void saveRecord({
              ...record,
              consultorioSolicitudId: record.consultorioSolicitudId,
              formularioHabilitacionConsultorio: {
                ...record.formularioHabilitacionConsultorio,
                consultorioSolicitudId: record.consultorioSolicitudId,
                comprobantePagoArchivo: file,
                comprobantePagoNombre: name,
                estadoPago: "COMPROBANTE_RECIBIDO",
                comprobantePagoAt: new Date().toISOString(),
              },
            })
          }
          saving={false}
          isPendingSave={false}
        />
        {!consultorioValidated && (
          <section className="cokifimi-member-consultorio-view-payment">
            {consultorioProgress}
            {consultorioPaymentPanel}
          </section>
        )}
        {consultorioValidated && consultorioValidityPanel}
      </>
    );
  if (false && screen === "consultorio" && record)
    return (
      <section className="cokifimi-member-consultorio-shell">
        <div className="cokifimi-member-form-return">
          <button
            type="button"
            onClick={() => {
              setConsultorio(EMPTY_CONSULTORIO);
              setScreen("dashboard");
            }}
          >
            <ArrowLeft /> Volver al panel del colegiado
          </button>
        </div>
        <form
          className="cokifimi-member-consultorio-form"
          onSubmit={saveConsultorio}
        >
          <div className="cokifimi-member-consultorio-heading">
            <Building2 />
            <div>
              <span>
                HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA
              </span>
              <h2>Alta de consultorio / área kinésica</h2>
              <p>
                Complete los datos del nuevo lugar de atención. La solicitud
                será enviada a administración para su revisión.
              </p>
            </div>
          </div>
          <div className="cokifimi-member-consultorio-fields">
            <label>
              Domicilio
              <input
                required
                value={consultorio.domicilio}
                onChange={(event) =>
                  updateConsultorio("domicilio", event.target.value)
                }
                placeholder="Calle"
              />
            </label>
            <label>
              Numeración
              <input
                required
                value={consultorio.numeracion}
                onChange={(event) =>
                  updateConsultorio("numeracion", event.target.value)
                }
                placeholder="Número"
              />
            </label>
            <label>
              Ciudad / localidad
              <input
                required
                value={consultorio.ciudad}
                onChange={(event) =>
                  updateConsultorio("ciudad", event.target.value)
                }
                placeholder="Ciudad o localidad"
              />
            </label>
            <label>
              Fecha de inicio de actividad
              <input
                required
                type="date"
                value={consultorio.fechaInicioConsultorio}
                onChange={(event) =>
                  updateConsultorio(
                    "fechaInicioConsultorio",
                    event.target.value,
                  )
                }
              />
            </label>
            <label>
              ¿Es titular del consultorio?
              <select
                value={consultorio.esTitularConsultorio}
                onChange={(event) =>
                  updateConsultorio("esTitularConsultorio", event.target.value)
                }
              >
                <option value="SI">SÍ</option>
                <option value="NO">NO</option>
              </select>
            </label>
            {consultorio.esTitularConsultorio === "NO" && (
              <label>
                ¿Es profesional adjunto?
                <select
                  value={consultorio.esProfesionalAdjunto}
                  onChange={(event) =>
                    updateConsultorio(
                      "esProfesionalAdjunto",
                      event.target.value,
                    )
                  }
                >
                  <option value="NO">NO</option>
                  <option value="SI">SÍ</option>
                </select>
              </label>
            )}
            {consultorio.esTitularConsultorio === "NO" && (
              <label className="cokifimi-member-consultorio-field-wide">
                Apellido y nombre del titular
                <input
                  required
                  value={consultorio.nombreTitularConsultorio}
                  onChange={(event) =>
                    updateConsultorio(
                      "nombreTitularConsultorio",
                      event.target.value,
                    )
                  }
                />
              </label>
            )}
            {consultorio.esTitularConsultorio === "NO" && (
              <label>
                Número de matrícula / habilitación
                <input
                  required
                  value={consultorio.numeroMatriculaConsultorio}
                  onChange={(event) =>
                    updateConsultorio(
                      "numeroMatriculaConsultorio",
                      event.target.value,
                    )
                  }
                  placeholder="Ej.: H-1234"
                />
              </label>
            )}
          </div>
          <div className="cokifimi-member-consultorio-actions">
            <button
              type="button"
              onClick={() => {
                setConsultorio(EMPTY_CONSULTORIO);
                setScreen("dashboard");
              }}
            >
              Cancelar
            </button>
            <button type="submit" disabled={loading}>
              <Building2 />{" "}
              {loading ? "Enviando..." : "Enviar alta de consultorio"}
            </button>
          </div>
        </form>
      </section>
    );

  return (
    <section className="cokifimi-member-shell">
      <div className="cokifimi-member-institutional-header">
        <CoKiFiMiLogo size={58} />
      </div>
      <div className="cokifimi-member-card">
        <header className="cokifimi-member-header">
          <div className="cokifimi-member-mark">
            <ShieldCheck />
          </div>
          <div>
            <h1>Portal del colegiado</h1>
          </div>
          {screen === "dashboard" && (
            <button
              type="button"
              onClick={logout}
              className="cokifimi-member-logout"
            >
              <LogOut /> Cerrar sesión
            </button>
          )}
        </header>

        {adjuntoAltaNotification && (
          <>
            <button
              type="button"
              className="cokifimi-member-adjunto-notification"
              onClick={() => setAdjuntoAltaNotification(adjuntoAltaNotification)}
              aria-haspopup="dialog"
            >
              <MailCheck />
              <span><strong>Nueva notificación</strong> Un profesional te agregó como adjunto en un alta de consultorio.</span>
            </button>
            <div className="cokifimi-adjunto-alta-modal fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="adjunto-alta-notification-title">
              <div className="cokifimi-adjunto-alta-dialog w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
                <div className="cokifimi-adjunto-alta-icon mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><MailCheck className="h-8 w-8" /></div>
                <h2 id="adjunto-alta-notification-title" className="mt-4 text-center text-xl font-extrabold text-slate-900">Alta de consultorio</h2>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">El profesional <strong>{adjuntoAltaNotification.titularName}</strong>, matrícula <strong>{adjuntoAltaNotification.titularMatricula || "sin informar"}</strong>, envió un alta de consultorio y te agregó como profesional adjunto.</p>
                <p className="cokifimi-adjunto-alta-warning mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">Si no tenés relación con este profesional o desconocés estar trabajando con él, informá al Colegio a la brevedad.</p>
                <p className="mt-4 text-center text-sm font-semibold text-slate-600">Muchas gracias.</p>
                <button type="button" className="cokifimi-adjunto-alta-confirm mt-6 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white" onClick={() => setAdjuntoAltaNotification(null)}>Entendido</button>
              </div>
            </div>
          </>
        )}
        {loading && (screen === "consultorio" || screen === "consultorio-preview") && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="saving-consultorio-title">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
              <LoaderCircle className="cokifimi-payment-spinner mx-auto h-12 w-12 text-emerald-700" />
              <h2 id="saving-consultorio-title" className="mt-5 text-xl font-extrabold text-slate-900">Aguarde, guardando alta</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Estamos guardando la solicitud y sus archivos adjuntos. No cierre esta ventana.</p>
            </div>
          </div>
        )}        {paymentNotice && (
          <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="member-payment-notice-title">
            <div className="cokifimi-member-payment-notice-dialog">
              <button type="button" className="cokifimi-member-payment-notice-close" onClick={() => setPaymentNotice(null)} aria-label="Cerrar aviso"><X /></button>
              {paymentNotice === "sending" ? <LoaderCircle className="cokifimi-payment-spinner" /> : <CheckCircle2 />}
              <h2 id="member-payment-notice-title">{paymentNotice === "sending" ? "ENVIANDO COMPROBANTE" : "COMPROBANTE ENVIADO"}</h2>
              <p>{paymentNotice === "sending" ? "Aguarde mientras guardamos el comprobante de pago." : "El comprobante fue enviado a Administración."}</p>
            </div>
          </div>
        )}
        {showUpdatedModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="member-updated-title">
            <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
              <h2 id="member-updated-title" className="mt-4 text-xl font-extrabold text-slate-900">{updatedModalMode === "libre-deuda" ? "Enviado" : "Actualizado"}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{updatedModalMode === "libre-deuda" ? "Su pedido de Libre Deuda fue enviado correctamente. Podrá consultar el estado desde este panel." : "La información fue actualizada correctamente. Volviendo al panel de Formulario 1."}</p>
            </div>
          </div>
        )}

        {message && (
          <div className="cokifimi-member-message">
            <CheckCircle2 /> {message}
          </div>
        )}
        {error && !error.includes("validez legal") && <div className="cokifimi-member-error">{error}</div>}

        {screen === "access" && (
          <div className="cokifimi-member-content cokifimi-member-access-content">
            <div className="cokifimi-member-intro">
              <KeyRound />
              <h2>Acceso personal seguro</h2>
              <p>
                {loginOnly
                  ? 'Ingrese con su DNI y token para continuar.'
                  : registrationOnly
                    ? 'Ingrese su DNI y correo de gmail para poder registrarse y dar de Alta su token de acceso'
                    : 'Si ya cuenta con token, ingrese con su DNI. Si todavía no tiene acceso, valide su correo para crear su token personal.'}
              </p>
            </div>

            {!loginOnly && (
              <form
                id="member-registration-form"
                onSubmit={requestCode}
                className="cokifimi-member-form"
              >
                <label htmlFor="member-dni">DNI para registrarse</label>
                <input
                  id="member-dni"
                  required
                  inputMode="numeric"
                  value={registrationDni}
                  onChange={(event) =>
                    setRegistrationDni(onlyDigits(event.target.value))
                  }
                  placeholder="Solo números"
                />
                <label htmlFor="member-email">Correo Gmail registrado</label>
                {email && !isGmailAddress(email) && (
                  <div className="cokifimi-member-gmail-alert" role="alert">
                    Debe utilizar un correo de gmail de forma obligatoria.
                  </div>
                )}
                <input
                  id="member-email"
                  required
                  type="text"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim())}
                  placeholder="nombre@gmail.com"
                />
                <small className="cokifimi-member-gmail-hint">
                  Debe utilizar un correo de gmail de forma obligatoria.
                </small>
                <div className="cokifimi-email-official-notice" role="note">
                  <span>
                    Este correo quedará registrado como su medio oficial de
                    contacto para las declaraciones y comunicaciones del Colegio.
                  </span>
                </div>
                <label className={`cokifimi-member-token-legal-acceptance flex items-start gap-2 rounded-lg border p-3 text-left text-[11px] leading-relaxed ${error.includes("validez legal") ? "is-invalid" : "border-slate-300 bg-slate-50 text-slate-700"}`}>
                  <input type="checkbox" checked={tokenLegalAccepted} onChange={(event) => setTokenLegalAccepted(event.target.checked)} />
                  <span>Acepto que, al generar mi clave única digital para todo trámite (TOKEN) en este Colegio, todo trámite realizado o solicitado tendrá la validez de un trámite efectuado con firma certificada, aceptando la legalidad que esto implica.</span>
                </label>
                {error.includes("validez legal") && <div className="cokifimi-member-error" role="alert">{error}</div>}
                <button
                  type="button"
                  disabled={loadingAction === "code"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void requestCode(event as unknown as FormEvent);
                  }}
                >
                  <MailCheck />{" "}
                  {loadingAction === "code"
                    ? "Enviando..."
                    : "Enviar código de verificación"}
                </button>
              </form>
            )}

            {!registrationOnly && (
              <>
                {!loginOnly && (
                  <div className="cokifimi-member-divider">
                    <button
                      type="button"
                      className="cokifimi-member-first-access-help"
                      onClick={() => setFirstAccessHelpOpen(true)}
                    >
                      <KeyRound /> <span>¿Todavía no tiene token?</span>
                    </button>
                  </div>
                )}
                <form
                  id="member-login-form"
                  onSubmit={login}
                  className="cokifimi-member-inline-form"
                >
                  <input
                    required
                    inputMode="numeric"
                    value={dni}
                    onChange={(event) => setDni(onlyDigits(event.target.value))}
                    placeholder="DNI"
                  />
                  <input
                    required
                    inputMode="numeric"
                    maxLength={6}
                    value={accessToken}
                    onChange={(event) =>
                      setAccessToken(onlyDigits(event.target.value))
                    }
                    placeholder="Token de 6 dígitos"
                  />
                  <button
                    type="button"
                    disabled={loadingAction === "login"}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void login(event as unknown as FormEvent);
                    }}
                  >
                    <LogIn />{" "}
                    {loadingAction === "login" ? "Ingresando..." : "Ingresar"}
                  </button>
                </form>
                {!loginOnly && (
                  <p className="cokifimi-member-token-help">
                    ¿Olvidó o necesita restablecer su token? Solicite uno nuevo a la
                    Administración del Colegio.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {firstAccessHelpOpen && (
          <div
            className="cokifimi-member-modal-backdrop"
            role="presentation"
            onClick={() => setFirstAccessHelpOpen(false)}
          >
            <section
              className="cokifimi-member-first-access-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-first-access-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cokifimi-member-modal-close"
                onClick={() => setFirstAccessHelpOpen(false)}
                aria-label="Cerrar ayuda"
              >
                ×
              </button>
              <MailCheck aria-hidden="true" />
              <h2 id="member-first-access-title">Crear su token de acceso</h2>
              <p>
                Si ya tiene una declaración cargada, ingrese el DNI y el correo
                registrados en ella.
              </p>
              <p>
                Recibirá un código de verificación en ese correo. Ingréselo en
                el siguiente paso y luego cree su token personal de 6 dígitos
                para acceder a su panel privado.
              </p>
              <button
                type="button"
                className="cokifimi-member-modal-confirm"
                onClick={() => setFirstAccessHelpOpen(false)}
              >
                Entendido
              </button>
            </section>
          </div>
        )}

        {bianualRequiredOpen && (
          <div
            className="cokifimi-member-modal-backdrop"
            role="presentation"
            onClick={() => setBianualRequiredOpen(false)}
          >
            <section
              className="cokifimi-member-first-access-modal cokifimi-member-bianual-required-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-bianual-required-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cokifimi-member-modal-close"
                onClick={() => setBianualRequiredOpen(false)}
                aria-label="Cerrar aviso"
              >
                ×
              </button>
              <AlertTriangle aria-hidden="true" />
              <h2 id="member-bianual-required-title">{"\u26A0\uFE0F ACCI\u00D3N REQUERIDA"}</h2>
              <p>Debe crear su <strong>{"Declaraci\u00F3n Bianual"}</strong>.</p>
              <p className="cokifimi-member-bianual-required-warning">{"\uD83D\uDEA8 De no realizarla, su token ser\u00E1 eliminado autom\u00E1ticamente en las pr\u00F3ximas 24 horas."}</p>
              <button
                type="button"
                className="cokifimi-member-modal-confirm"
                onClick={() => {
                  setBianualRequiredOpen(false);
                  setPendingRecord(null);
                  setScreen("form");
                }}
              >
                Crear Declaración Bianual
              </button>
            </section>
          </div>
        )}
        {tokenBlockedOpen && (
          <div
            className="cokifimi-member-modal-backdrop"
            role="presentation"
            onClick={() => setTokenBlockedOpen(false)}
          >
            <section
              className="cokifimi-member-first-access-modal cokifimi-member-token-blocked-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-token-blocked-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cokifimi-member-modal-close"
                onClick={() => setTokenBlockedOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <ShieldCheck aria-hidden="true" />
              <h2 id="member-token-blocked-title">Acceso inhabilitado</h2>
              <p>
                Por favor comunicarse al Colegio para volver habilitar y
                reestablecer su token.
              </p>
              <button
                type="button"
                className="cokifimi-member-modal-confirm"
                onClick={() => setTokenBlockedOpen(false)}
              >
                Entendido
              </button>
            </section>
          </div>
        )}

        {tokenResetOpen && (
          <div
            className="cokifimi-member-modal-backdrop"
            role="presentation"
            onClick={() => setTokenResetOpen(false)}
          >
            <section
              className="cokifimi-member-first-access-modal cokifimi-member-token-reset-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-token-reset-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cokifimi-member-modal-close"
                onClick={() => setTokenResetOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <MailCheck aria-hidden="true" />
              <h2 id="member-token-reset-title">Token restablecido</h2>
              <p>
                Se restableció su token. Debe volver a verificar su correo
                electrónico y DNI en la parte inferior del panel para generar un
                nuevo token.
              </p>
              <button
                type="button"
                className="cokifimi-member-modal-confirm"
                onClick={() => setTokenResetOpen(false)}
              >
                Entendido
              </button>
            </section>
          </div>
        )}

        {memberNotRegisteredOpen && (
          <div
            className="cokifimi-member-modal-backdrop"
            role="presentation"
            onClick={() => setMemberNotRegisteredOpen(false)}
          >
            <section
              className="cokifimi-member-first-access-modal cokifimi-member-not-registered-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-not-registered-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="cokifimi-member-modal-close"
                onClick={() => setMemberNotRegisteredOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <MailCheck aria-hidden="true" />
              <h2 id="member-not-registered-title">Registro no encontrado</h2>
              <p>NO SE ENCUENTRA SU REGISTRO</p>
              <p>
                Debe registrarse para obtener su token en la parte inferior
                mediante su correo electrónico de Gmail.
              </p>
              <button
                type="button"
                className="cokifimi-member-modal-confirm"
                onClick={() => setMemberNotRegisteredOpen(false)}
              >
                Entendido
              </button>
            </section>
          </div>
        )}

        {screen === "verify" && (
          <form
            onSubmit={verifyAndCreateToken}
            className="cokifimi-member-content cokifimi-member-form"
          >
            <div className="cokifimi-member-intro">
              <MailCheck />
              <h2>Verifique su correo</h2>
              <p>
                Ingrese el código recibido y cree un token personal de seis
                dígitos.
              </p>
            </div>
            <label htmlFor="member-code">Código recibido</label>
            <input
              id="member-code"
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(onlyDigits(event.target.value))}
              placeholder="000000"
            />
            <label htmlFor="member-token">Token personal nuevo</label>
            <input
              id="member-token"
              required
              inputMode="numeric"
              maxLength={6}
              value={accessToken}
              onChange={(event) =>
                setAccessToken(onlyDigits(event.target.value))
              }
              placeholder="Elija 6 dígitos"
            />
            <p className="cokifimi-member-token-rules">
              Use 6 números que no sean correlativos, repetidos ni contengan los
              3 primeros números de su DNI.
            </p>
            <button type="submit" disabled={loading}>
              <KeyRound /> {loading ? "Verificando..." : "Crear mi acceso"}
            </button>
            <button
              type="button"
              className="cokifimi-member-resend-code"
              onClick={() => void resendCode()}
              disabled={loading}
            >
              ¿No recibió el código? Reenviar código
            </button>
          </form>
        )}

        {screen === "dashboard" && record && !record.memberProvisional && (
          <div className="cokifimi-member-content">
            <div className="cokifimi-member-welcome">
              <div className="cokifimi-member-profile-photo">
                {record.fotoUrl ? (
                  <img
                    src={record.fotoUrl}
                    alt={`Foto de ${record.nombres} ${record.apellido}`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserRound />
                )}
              </div>
              <div>
                <p>Bienvenido/a</p>
                <h2>
                  {record.nombres} {record.apellido}
                </h2>
                <span className="cokifimi-member-registration">
                  Matrícula profesional {record.matricula || "sin registrar"}
                </span>
                <div className="cokifimi-member-role-badge mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                  {getProfessionalRoleLabel(record)}
                </div>
                {(record.polizaPraxisArchivo || (isCurrentlyAdjunto(record) && record.certificadoAnssalArchivo)) && (
                  <div className="cokifimi-member-attachments-row">
                    {isCurrentlyAdjunto(record) && record.certificadoAnssalArchivo && (
                      <button
                        type="button"
                        onClick={() => downloadAttachment(record.certificadoAnssalArchivo, record.certificadoAnssalArchivoNombre || 'certificado-anssal.pdf')}
                        className="cokifimi-member-attachment-btn"
                      >
                        Descargar certificado ANSSAL
                      </button>
                    )}
                    {record.polizaPraxisArchivo && (
                      <button
                        type="button"
                        onClick={() => downloadAttachment(record.polizaPraxisArchivo, record.polizaPraxisArchivoNombre || 'poliza-praxis.pdf')}
                        className="cokifimi-member-attachment-btn"
                      >
                        Descargar póliza de praxis
                      </button>
                    )}
                  </div>
                )}
              </div>
            {removedAttachedProfessionals.length > 0 && (
              <div className="cokifimi-member-adjunto-removed-alert" role="alert">
                <strong>Profesional adjunto eliminado</strong>
                <span>{removedAttachedProfessionals.map((item) => `${item.apellido}, ${item.nombres}`).join(" · ")} ya no figura como profesional adjunto. Debe actualizar su Alta de consultorio.</span>
                <button type="button" onClick={() => setScreen("consultorio")}>Actualizar mi Alta de consultorio</button>
              </div>
            )}
            </div>
            {isBianualAlertVisible(record.bianualAlert) && (
              <section className="cokifimi-member-bianual-alert" role="alert" aria-live="polite">
                <div className="cokifimi-member-bianual-alert-icon"><BellRing /></div>
                <div>
                  <strong>ALERTA DE ADMINISTRACIÓN</strong>
                  <p>{record.bianualAlert?.message}</p>
                  <small>Revise y modifique su Declaración Jurada Bianual según lo indicado.</small>
                </div>
              </section>
            )}
            <div className="cokifimi-member-current-form-label">
              <FilePenLine />
              <div>
                <span>FORMULARIO PRESENTADO</span>
                <strong>
                  DECLARACIÓN JURADA OBLIGATORIA BIANUAL DE DATOS FILIATORIOS Y PROFESIONALES
                </strong>
              </div>
            </div>
            <div
              className={`cokifimi-member-expiry-dashboard ${expired ? "is-expired" : ""}`}
              aria-label="Resumen de vigencia de la declaración"
            >
              <div className="cokifimi-member-expiry-card">
                <CalendarDays />
                <span>Presentación</span>
                <strong>{formattedPresentation}</strong>
              </div>
              <div className="cokifimi-member-expiry-card">
                <CalendarDays />
                <span>Vencimiento</span>
                <strong>{formattedExpiry}</strong>
              </div>
              <div className="cokifimi-member-expiry-card cokifimi-member-expiry-highlight">
                <CalendarDays />
                <span>{expired ? "Estado" : "Vigencia"}</span>
                <strong>{expiryDetail}</strong>
              </div>
            </div>
            <div
              className="cokifimi-member-consultorios-summary"
              aria-label="Consultorios activos"
            >
              <div className="cokifimi-member-consultorios-summary-title">
                <Building2 />
                <span>Consultorios activos</span>
                <strong>{activeConsultorioCount}</strong>
              </div>
              <div className="cokifimi-member-consultorios-summary-cities">
                <MapPin />
                <span>
                  {activeConsultorioCities.length
                    ? activeConsultorioCities.join(" · ")
                    : "Sin consultorios registrados"}
                </span>
              </div>
            </div>
            <div className="cokifimi-member-actions">
              <button
                type="button"
                onClick={() => {
                  setPendingRecord(null);
                  setScreen("preview");
                }}
              >
                <CalendarDays /> VER MI DECLARACIÓN JURADA
              </button>
              {/* Misma edición que "Editar info" en la tarjeta del Formulario 1. */}
              <button
                type="button"
                onClick={() => {
                  setPendingRecord(null);
                  setScreen("form");
                }}
              >
                <FilePenLine /> EDITAR MI DECLARACIÓN JURADA
              </button>
            </div>
            {consultorioSubmittedAt && (
              <section
                className="cokifimi-member-consultorio-submission"
                aria-label="Seguimiento del formulario de alta / actualización de consultorio"
              >
                <div className="cokifimi-member-current-form-label cokifimi-member-consultorio-presented-label">
                  <FilePenLine />
                  <div>
                    <span>
                      FORMULARIO DE ALTA / ACTUALIZACIÓN DE CONSULTORIO ·
                      PRESENTADA
                    </span>
                    <strong>
                      HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA
                    </strong>
                  </div>
                </div>
                <div
                  className="cokifimi-member-expiry-dashboard cokifimi-member-consultorio-presentation"
                  aria-label="Presentación del formulario de alta / actualización de consultorio"
                >
                                                      <div className="cokifimi-member-expiry-card cokifimi-member-consultorio-summary-card">
                    <div className="cokifimi-member-consultorio-summary-row">
                      <MapPin />
                      <div>
                        <span>Ubicación del consultorio</span>
                        <strong>{consultorioRequestedLocation || "Sin ubicación registrada"}</strong>
                      </div>
                    </div>
                    <div className="cokifimi-member-consultorio-summary-row">
                      <CalendarDays />
                      <div>
                        <span>Presentación</span>
                        <strong>{formatDateOnly(String(consultorioSubmittedAt || ""))}</strong>
                      </div>
                    </div>
                  </div>                  {renderAttachedManager({ id: "principal", formularioHabilitacionConsultorio: record.formularioHabilitacionConsultorio })}
                </div>
                {consultorioProgress}
                {consultorioPaymentPanel}
                {consultorioValidityPanel}
                <div className="cokifimi-member-actions">
                  <button
                    type="button"
                    onClick={() => { setRecord({ ...record!, consultorioSolicitudId: undefined }); setScreen("consultorio-view"); }}
                  >
                    <CalendarDays /> VER MI HABILITACIÓN DE CONSULTORIO
                  </button>
                </div>
                <div
                  className={`cokifimi-member-consultorio-validation ${consultorioValidated ? "is-validated" : consultorioRejected ? "is-rejected" : ""}`}
                >
                  <CheckCircle2 />
                  <div>
                    <strong>
                      HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA
                    </strong>
                    <span>
                      {consultorioAdminMessage &&
                      typeof consultorioAdminMessage === "string"
                        ? consultorioAdminMessage
                        : consultorioValidated
                          ? "La Administración revisó su solicitud."
                          : "La Administración podrá revisarlo y emitir su certificado."}
                    </span>
                  </div>
                  {consultorioValidated && consultorioCertificateHref && (
                    <a
                      href={consultorioCertificateHref}
                      download={
                        typeof consultorioCertificateName === "string"
                          ? consultorioCertificateName
                          : "certificado-formulario-2"
                      }
                    >
                      <Download /> Descargar certificado
                    </a>
                  )}
                  {consultorioValidated && consultorioCertificateEticaHref && (
                    <a href={consultorioCertificateEticaHref} download={typeof consultorioCertificateEticaName === "string" ? consultorioCertificateEticaName : "certificado-etica-libre-deuda"}>
                      <Download /> Descargar certificado de ética / libre deuda
                    </a>
                  )}
                  {consultorioPaymentStatus === "PAGO_VALIDADO" && consultorioReceiptHref && (
                    <a href={consultorioReceiptHref} download={typeof consultorioReceiptName === "string" ? consultorioReceiptName : "recibo-de-pago"}>
                      <Download /> Descargar recibo de pago
                    </a>
                  )}
                </div>
              </section>
            )}
            {consultorioRequests.filter((request) => request.id !== "principal").map((request, requestIndex) => {
              const form = request.formularioHabilitacionConsultorio || {};
              const location = [form.domicilioConsultorio, form.numeroConsultorio, form.localidadConsultorio].filter(Boolean).join(" ");
              const submittedAt = String(form.submittedAt || "");
              const rejected = form.estadoAdmin === "RECHAZADO";
              const validated = !rejected && (form.validadoAdmin === true || form.estadoAdmin === "APROBADO");
              const amountStatus = String(form.estadoImporte || "");
              const paymentStatus = String(form.estadoPago || (form.reciboPagoArchivo ? "PAGO_VALIDADO" : ""));
              const amount = Number(form.importeConfirmado || 0);
              const status = validated ? "Solicitud aprobada" : rejected ? "Solicitud rechazada" : paymentStatus === "PAGO_VALIDADO" ? "Pago validado · pendiente de aprobación" : paymentStatus === "COMPROBANTE_RECIBIDO" ? "Comprobante recibido · en verificación" : amountStatus === "IMPORTE_CONFIRMADO" ? "Esperando pago" : "Pendiente de revisión";
              const validityFrom = String(form.certificadoVigenciaDesde || form.validadoAt || submittedAt || "");
              const validityTo = String(form.certificadoVigenciaHasta || (() => {
                if (!validityFrom || !validated) return "";
                const months = Number(String(form.mesesHabilitacion || form.periodoHabilitacion || "").match(/6|12|24/)?.[0] || 6);
                const date = parseDateOnly(validityFrom);
                date.setMonth(date.getMonth() + months);
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              })());
              const validityDays = validityTo && validated
                ? Math.ceil((parseDateOnly(validityTo).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000)
                : null;
              const certificateUrl = typeof form.certificadoUrl === "string" ? form.certificadoUrl : "";
              const certificateName = typeof form.certificadoNombre === "string" ? form.certificadoNombre : "certificado-formulario-2";
              const certificateEthicsUrl = typeof form.certificadoEticaUrl === "string" ? form.certificadoEticaUrl : "";
              const certificateEthicsName = typeof form.certificadoEticaNombre === "string" ? form.certificadoEticaNombre : "certificado-etica-libre-deuda";
              const receiptUrl = typeof form.reciboPagoArchivo === "string" ? form.reciboPagoArchivo : "";
              const receiptName = typeof form.reciboPagoNombre === "string" ? form.reciboPagoNombre : "recibo-de-pago";
              const requestKey = request.id;
              return (
                <section key={requestKey} className="cokifimi-member-consultorio-submission cokifimi-member-consultorio-submission-additional" aria-label={`Seguimiento del Alta ${requestIndex + 2}`}>
                  <div className="cokifimi-member-current-form-label cokifimi-member-consultorio-presented-label">
                    <FilePenLine />
                    <div>
                      <span>FORMULARIO DE ALTA / ACTUALIZACIÓN · PRESENTADA</span>
                      <strong>ALTA {requestIndex + 2} · HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA</strong>
                    </div>
                  </div>
                  <div className="cokifimi-member-expiry-dashboard cokifimi-member-consultorio-presentation">
                    <div className="cokifimi-member-expiry-card cokifimi-member-consultorio-summary-card">
                      <div className="cokifimi-member-consultorio-summary-row"><MapPin /><div><span>Ubicación del consultorio</span><strong>{location || "Sin ubicación registrada"}</strong></div></div>
                      <div className="cokifimi-member-consultorio-summary-row"><CalendarDays /><div><span>Presentación</span><strong>{formatDateOnly(submittedAt)}</strong></div></div>
                    </div>
                    {renderAttachedManager(request)}
                  </div>
                  <div className={`cokifimi-member-consultorio-progress ${rejected ? "is-rejected" : validated ? "is-approved" : ""}`}>
                    <div className="cokifimi-member-consultorio-progress-heading"><strong>Seguimiento del trámite</strong><span>{status}</span></div>
                    <div className="cokifimi-member-consultorio-progress-steps">
                      <div className="is-done"><b>1</b><span>Solicitud presentada</span></div>
                      <div className={amountStatus === "IMPORTE_CONFIRMADO" ? "is-done" : ""}><b>2</b><span>Importe confirmado</span></div>
                      <div className={paymentStatus === "COMPROBANTE_RECIBIDO" || paymentStatus === "PAGO_VALIDADO" ? "is-done" : ""}><b>3</b><span>Comprobante recibido</span></div>
                      <div className={validated ? "is-done" : ""}><b>4</b><span>Alta y certificados</span></div>
                    </div>
                  </div>
                  {!validated && !rejected && (() => {
                    const pendingFile = pendingPaymentFilesByRequest[requestKey] || null;
                    const requestPaymentSending = paymentSendingByRequest[requestKey] === true;
                    const requestPaymentSent = paymentSentByRequest[requestKey] === true;
                    const amountConfirmed = amountStatus === "IMPORTE_CONFIRMADO";
                    const canUpload = amountConfirmed && paymentStatus !== "COMPROBANTE_RECIBIDO" && paymentStatus !== "PAGO_VALIDADO";
                    return (
                      <section className={"cokifimi-member-payment-panel " + (!amountConfirmed ? "is-awaiting-amount" : "")} aria-label={"Importe y comprobante del Alta " + (requestIndex + 2)}>
                        {!amountConfirmed ? (
                          <div>
                            <strong className="cokifimi-member-awaiting-title">Aguarde el monto a pagar</strong>
                            <span>La Administración confirmará el importe definitivo.</span>
                            <small>El monto aparecerá aquí en su panel para que pueda abonarlo por transferencia.</small>
                          </div>
                        ) : (
                          <>
                            <div><span>Importe de habilitación</span><small>Importe confirmado por Administración</small><strong>$ {amount.toLocaleString("es-AR")}</strong></div>
                            <div className="cokifimi-member-bank-details"><strong>*Home Banking</strong><span>*Banco De La Nación Argentina- Sucursal Posadas</span><span>CBU: 0110407720040712036177</span><span>Alias: cokifimi</span><span>Cuenta corriente en Pesos N°40712036/17</span><span>Cuit: 30-67238903-4</span></div>
                            <p className="cokifimi-member-payment-instruction">{consultorioPaymentInstructionText}</p><div className="cokifimi-member-payment-warning"><strong>Importante</strong><span>Adjunte el comprobante ORIGINAL y envíelo. En el comprobante se debe ver la fecha de la transacción, CBU 0110407720040712036177 o Cuenta corriente en Pesos N°4071203617 del Colegio y el monto abonado.</span></div>
                            {canUpload ? (
                              <>
                                <label className="cokifimi-member-payment-upload">Seleccionar comprobante original
                                  <input type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    void readPaymentFile(file).then((preparedFile) => setPendingPaymentFilesByRequest((current) => ({ ...current, [requestKey]: preparedFile })));
                                  }} />
                                </label>
                                {pendingFile && (
                                  <div className="cokifimi-member-payment-preview">
                                    <strong>Vista previa: {pendingFile.name}</strong>
                                    {pendingFile.url.startsWith("data:image/") ? <img src={pendingFile.url} alt="Vista previa del comprobante" /> : <iframe src={pendingFile.url} title="Vista previa del comprobante" />}
                                    <div>
                                      <button type="button" disabled={requestPaymentSending || requestPaymentSent} onClick={async () => {
                                        setPaymentNotice("sending");
                                        setPaymentSendingByRequest((current) => ({ ...current, [requestKey]: true }));
                                        const paymentRequestId = resolveConsultorioPaymentRequestId(record, requestKey, form);
                                        const sent = await saveRecord({
                                          id: record!.id,
                                          consultorioSolicitudId: paymentRequestId,
                                          formularioHabilitacionConsultorio: {
                                            ...form,
                                            consultorioSolicitudId: paymentRequestId,
                                            nuevaSolicitudConsultorio: undefined,
                                            comprobantePagoArchivo: pendingFile.url,
                                            comprobantePagoNombre: pendingFile.name,
                                            estadoPago: "COMPROBANTE_RECIBIDO",
                                            comprobantePagoAt: new Date().toISOString(),
                                          },
                                        } as unknown as DeclarationData);
                                        setPaymentSendingByRequest((current) => ({ ...current, [requestKey]: false }));
                                        if (sent) {
                                          setPaymentSentByRequest((current) => ({ ...current, [requestKey]: true }));
                                          setPaymentNotice("sent");
                                          setMessage("Comprobante enviado correctamente.");
                                        }
                                      }}>{requestPaymentSending ? <><LoaderCircle className="cokifimi-payment-spinner" size={16} /> Enviando...</> : requestPaymentSent ? "✓ Enviado" : "Enviar comprobante"}</button>
                                      <button type="button" disabled={requestPaymentSending} onClick={() => setPendingPaymentFilesByRequest((current) => ({ ...current, [requestKey]: null }))}>Elegir otro archivo</button>
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : <p>{paymentStatus === "COMPROBANTE_RECIBIDO" ? "COMPROBANTE ENVIADO Y EN ESPERA DE ALTA" : paymentStatus === "PAGO_VALIDADO" ? "PAGO VALIDADO. EN ESPERA DE APROBACIÓN Y EMISIÓN DEL ALTA" : "Adjunte el comprobante original para continuar."}</p>}
                          </>
                        )}
                      </section>
                    );
                  })()}
                  {rejected && (
                    <div className="cokifimi-member-consultorio-resubmit">
                      <strong>Solicitud rechazada</strong>
                      <span>Corrija los datos indicados por Administración y vuelva a enviar esta misma Alta para revisión.</span>
                      <span className="cokifimi-member-rejection-message"><strong>Mensaje de Administración:</strong> {String(form.mensajeAdmin || form.descripcionCertificado || "No se indicó un motivo adicional.")}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecord({
                            ...record!,
                            consultorioSolicitudId: requestKey,
                            formularioHabilitacionConsultorio: {
                              ...form,
                              consultorioSolicitudId: requestKey,
                            },
                          });
                          setNewConsultorioRequestId(requestKey);
                          setScreen("consultorio");
                        }}
                      >
                        <FilePenLine /> Editar y enviar correcciones
                      </button>
                    </div>
                  )}                  {validated && (validityFrom || validityTo) && <>
                    <div className="cokifimi-member-consultorio-validity">
                      <div><CalendarDays /><span>Vigencia desde</span><strong>{formatDateOnly(validityFrom)}</strong></div>
                      <div><CalendarDays /><span>Vencimiento</span><strong>{formatDateOnly(validityTo)}</strong></div>
                      <div className="is-highlight"><CalendarDays /><span>Vigencia</span><strong>{validityDays !== null && validityDays < 0 ? "Vencida" : `${validityDays} días restantes`}</strong></div>
                    </div>
                  <div className="cokifimi-member-actions"><button type="button" onClick={() => { setRecord({ ...record!, consultorioSolicitudId: request.id, formularioHabilitacionConsultorio: { ...form, consultorioSolicitudId: request.id } }); setScreen("consultorio-view"); }}><CalendarDays /> VER MI HABILITACIÓN DE CONSULTORIO</button></div>
                    <div className="cokifimi-member-consultorio-validation is-validated">
                      <CheckCircle2 />
                      <div>
                        <strong>HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA</strong>
                        <span>{String(form.mensajeAdmin || "") || "La Administración aprobó esta solicitud."}</span>
                      </div>
                      {certificateUrl && <a href={certificateUrl} download={certificateName}><Download /> Descargar certificado</a>}
                      {certificateEthicsUrl && <a href={certificateEthicsUrl} download={certificateEthicsName}><Download /> Descargar certificado de ética / libre deuda</a>}
                      {paymentStatus === "PAGO_VALIDADO" && receiptUrl && <a href={receiptUrl} download={receiptName}><Download /> Descargar recibo de pago</a>}
                    </div>
                  </>}
                </section>
              );
            })}            {false && consultorioValidated &&
              consultorioCertificateEticaHref && (
                <div className="cokifimi-member-consultorio-certificates">
                  <strong>HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA</strong>
                  <a
                    href={consultorioCertificateEticaHref}
                    download={
                      typeof consultorioCertificateEticaName === "string"
                        ? consultorioCertificateEticaName
                        : "certificado-etica-libre-deuda"
                    }
                  >
                    <Download /> Descargar certificado de ética / libre deuda
                  </a>
                </div>
              )}
            {consultorioRejected && (
              <div className="cokifimi-member-consultorio-resubmit">
                <strong>HABILITACIÓN DE CONSULTORIO / ÁREA KINÉSICA</strong>
                <span>
                  Edite la solicitud y vuelva a enviarla para una nueva
                  revisión.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const primaryRejected = record?.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO";
                    const rejectedRequest = primaryRejected
                      ? undefined
                      : record?.consultorioSolicitudes?.find((request) =>
                        request.id === record?.consultorioSolicitudId
                        && request.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO",
                      ) || record?.consultorioSolicitudes?.find((request) =>
                        request.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO",
                      );
                    const requestId = primaryRejected
                      ? null
                      : rejectedRequest?.id
                        || record?.consultorioSolicitudId
                        || resolveConsultorioPaymentRequestId(record, undefined, record?.formularioHabilitacionConsultorio || {})
                        || null;
                    const rejectedForm = rejectedRequest?.formularioHabilitacionConsultorio
                      || record?.formularioHabilitacionConsultorio
                      || {};
                    setRecord(record ? {
                      ...record,
                      consultorioSolicitudId: requestId || undefined,
                      formularioHabilitacionConsultorio: {
                        ...rejectedForm,
                        consultorioSolicitudId: requestId || undefined,
                      },
                    } : record);
                    setNewConsultorioRequestId(requestId);
                    setConsultorio(EMPTY_CONSULTORIO);
                    setScreen("consultorio");
                  }}
                >
                  <FilePenLine /> Editar y enviar nuevamente
                </button>
              </div>
            )}
            {consultorioResent && !consultorioRejected && !consultorioValidated && (
              <div className="cokifimi-member-consultorio-resent">
                <CheckCircle2 /> Enviado nuevamente para su revisión
              </div>
            )}
            <p className="cokifimi-member-help">
              Las actualizaciones quedan registradas para revisión de
              administración. Para consultas especiales, comuníquese con el
              Colegio.
            </p>
          </div>
        )}
        {screen === "dashboard" && record && !record.memberProvisional && (
          <section
            className="cokifimi-member-forms-board"
            aria-labelledby="member-forms-title"
          >
            <div className="cokifimi-member-forms-heading">
              <span>GESTIÓN PERSONAL</span>
              <h2 id="member-forms-title">Mis formularios</h2>
              <p>
                Este espacio está preparado para centralizar sus tres
                formularios institucionales.
              </p>
            </div>
            <div className="cokifimi-member-forms-grid">
              <article className="cokifimi-member-form-card is-active is-formulario-1">
                <div className="cokifimi-member-form-card-icon">
                  <ClipboardCheck />
                </div>
                <span className="cokifimi-member-form-card-kicker is-presented">
                  <CheckCircle2 /> FORMULARIO 1 · PRESENTADO
                </span>
                <h3>DECLARACIÓN JURADA OBLIGATORIA BIANUAL DE DATOS FILIATORIOS Y PROFESIONALES</h3>
                <p>
                  Consulte el estado de vigencia y descargue la declaración
                  presentada.
                </p>
                <div className="cokifimi-member-form-card-actions"><button
                  type="button"
                  onClick={() => {
                    setPendingRecord(null);
                    setScreen("preview");
                  }}
                >
                  <CalendarDays /> Ver declaración
                </button>
                <button type="button" onClick={() => { setPendingRecord(null); setScreen("form"); }}>
                  <FilePenLine /> Editar info
                </button>
                </div>
              </article>
              <article className={`cokifimi-member-form-card ${trabajaEnConsultorio ? "is-active" : "is-upcoming is-consultorio-blocked"} is-formulario-2`}>
                <div className="cokifimi-member-form-card-icon"><Stethoscope /></div>
                <span className={`cokifimi-member-form-card-kicker ${consultorioSubmittedAt ? "is-presented" : ""}`}>
                  {consultorioSubmittedAt && <CheckCircle2 />} FORMULARIO 2 · {consultorioSubmittedAt ? "PRESENTADO" : trabajaEnConsultorio ? "DISPONIBLE" : "BLOQUEADO"}
                </span>
                <h3>Alta de consultorio / área kinésica</h3>
                <p>{trabajaEnConsultorio ? "Informe un nuevo lugar de atención para enviarlo a revisión de administración." : "No disponible porque declaró que no trabaja en consultorio / área kinésica."}</p>
                {consultorioSubmittedAt ? sortedConsultorioRequests.map((request) => {
                  const requestForm = request.formularioHabilitacionConsultorio || {};
                  const requestLocation = [requestForm.domicilioConsultorio, requestForm.numeroConsultorio, requestForm.localidadConsultorio].filter(Boolean).join(" ");
                  return <button key={request.id} type="button" onClick={() => {
                    setAddingConsultorio(false);
                    setRecord({ ...record!, consultorioSolicitudId: request.id === "principal" ? undefined : request.id, formularioHabilitacionConsultorio: requestForm });
                    setScreen("consultorio-view");
                  }}>
                    <CalendarDays />
                    <span className="cokifimi-member-form-card-button-content"><strong>Ver solicitud y adjuntos</strong><small>{requestLocation || "Ubicación no informada"}</small></span>
                  </button>;
                }) : <button type="button" disabled={!trabajaEnConsultorio} onClick={() => {
                  setConsultorio(EMPTY_CONSULTORIO);
                  setScreen("consultorio");
                }}>
                  <Building2 />
                  <span className="cokifimi-member-form-card-button-content"><strong>{!trabajaEnConsultorio ? "Alta no disponible" : "Dar de alta o actualizar mi Consultorio"}</strong></span>
                </button>}
                {consultorioSubmittedAt && trabajaEnConsultorio && canRequestAnotherConsultorio && <div className="cokifimi-member-additional-consultorio-requests">
                  <strong>Más consultorios particulares</strong>
                  <button type="button" className="cokifimi-member-new-consultorio-button" onClick={() => {
                    setNewConsultorioBlockedAddresses(consultorioRequests.map((request) => { const form = request.formularioHabilitacionConsultorio || {}; return `${form.domicilioConsultorio || ""} ${form.numeroConsultorio || ""} ${form.localidadConsultorio || ""}`.trim(); }).filter(Boolean));
                    setAddingConsultorio(true);
                    setRecord({ ...record!, consultorioSolicitudId: undefined });
                    setNewConsultorioRequestId(null);
                    setConsultorio(EMPTY_CONSULTORIO);
                    setScreen("consultorio");
                  }}>
                    <Building2 className="cokifimi-member-new-consultorio-icon" />
                    <span className="cokifimi-member-form-card-button-content"><strong>Solicitar otra habilitación</strong><small>Seleccionar una nueva ubicación</small></span>
                  </button>
                </div>}
              </article>
              {<article className={`cokifimi-member-form-card is-active is-libre-deuda ${libreDeudaSolicitud?.estado === "RECHAZADO" ? "is-libre-deuda-rejected" : ""}`}> 
                <div className="cokifimi-member-form-card-icon"><ShieldCheck /></div>
                <span className="cokifimi-member-form-card-kicker">CERTIFICADO LIBRE DE DEUDA</span>
                <h3>Solicitud de Libre Deuda</h3>
                {libreDeudaSolicitud ? <div className={`cokifimi-libre-deuda-summary is-${libreDeudaSolicitud.estado.toLowerCase()} ${libreDeudaVigenciaEstado ? `is-vigencia-${libreDeudaVigenciaEstado}` : ""}`}>
                  <strong className="cokifimi-libre-deuda-summary-status">{libreDeudaSolicitud.estado === "APROBADO" ? libreDeudaVencida ? "Certificado vencido" : "Solicitud aprobada" : libreDeudaSolicitud.estado === "RECHAZADO" ? "Solicitud rechazada" : "Solicitud en revisión"}</strong>
                  <div className="cokifimi-libre-deuda-dates"><span><small>Fecha de alta</small><b>{formatDateOnly(libreDeudaSolicitud.revisadoAt || libreDeudaSolicitud.submittedAt)}</b></span></div>
                  {libreDeudaSolicitud.estado === "APROBADO" && libreDeudaVenceAt && <div className="cokifimi-libre-deuda-member-validity"><Clock3 /><div><small>{libreDeudaVigenciaEstado === "vencido" ? "Certificado vencido" : libreDeudaVigenciaEstado === "por-vencer" ? "Próximo a vencer" : "Certificado vigente"}</small><b>{formatDateOnly(libreDeudaVenceAt)}</b><span>{libreDeudaVigenciaDetalle}</span></div></div>}
                  {libreDeudaVencida && <small className="cokifimi-libre-deuda-expired-notice">Este certificado venció. Podés realizar una nueva solicitud.</small>}
                  {libreDeudaSolicitud.estado === "RECHAZADO" && libreDeudaSolicitud.mensajeAdmin && <small>{libreDeudaSolicitud.mensajeAdmin}</small>}
                </div> : <p>Solicite su certificado al Colegio.</p>}
                {libreDeudaSolicitud?.estado === "APROBADO" ? libreDeudaVencida ? <button type="button" className="cokifimi-member-card-action cokifimi-libre-deuda-new-request" disabled={!libreDeudaPuedeSolicitar} onClick={() => void solicitarLibreDeuda()}><RefreshCw /> Realizar nueva solicitud</button> : <div className="cokifimi-member-libre-deuda-downloads">{libreDeudaSolicitud.comprobantePagoUrl && <button type="button" className="cokifimi-member-card-action cokifimi-libre-deuda-payment-download" onClick={descargarComprobanteLibreDeuda}><Download /> Descargar comprobante de pago</button>}<button type="button" className="cokifimi-member-card-action" onClick={descargarLibreDeuda}><Download /> Descargar certificado</button></div> : libreDeudaSolicitud?.estado === "RECHAZADO" ? <label className="cokifimi-member-card-action cokifimi-libre-deuda-resubmit" aria-disabled={!libreDeudaPuedeSolicitar}><span className="cokifimi-libre-deuda-resubmit-icon"><RefreshCw /></span><span className="cokifimi-libre-deuda-resubmit-copy"><strong>Adjuntar comprobante</strong><small>y enviar la solicitud nuevamente</small></span><input type="file" accept="image/*,.pdf,application/pdf" disabled={!libreDeudaPuedeSolicitar} onChange={(event) => { const file = event.target.files?.[0]; if (file) void reenviarLibreDeudaConComprobante(file); event.currentTarget.value = ""; }} /></label> : libreDeudaSolicitud ? null : <button type="button" disabled={!libreDeudaPuedeSolicitar} onClick={() => void solicitarLibreDeuda()}><ShieldCheck /> Solicitar Libre Deuda</button>}
              </article>}
            </div>
          </section>
        )}
        {consultorioHistoryForm && createPortal((
          <div className="cokifimi-member-history-modal" role="dialog" aria-modal="true" aria-labelledby="consultorio-history-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setConsultorioHistoryForm(null); }}>
            <div className="cokifimi-member-history-card">
              <header><div className="cokifimi-member-history-heading"><History /><div><h2 id="consultorio-history-title">Historial de la solicitud</h2><p className="cokifimi-member-history-person"><UserRound /> {record?.apellido}, {record?.nombres}</p></div></div><button type="button" aria-label="Cerrar historial" onClick={() => setConsultorioHistoryForm(null)}><X /></button></header><div className="cokifimi-member-history-meta"><div><BadgeCheck /><span>Matrícula</span><b>{record?.matricula || "Sin informar"}</b></div><div><MapPin /><span>Ciudad del consultorio</span><b>{String(consultorioHistoryForm.localidadConsultorio || "Sin informar")}</b></div></div>
              <div className="cokifimi-member-history-list">
                {[...(Array.isArray(consultorioHistoryForm.historialSolicitud) ? consultorioHistoryForm.historialSolicitud : []), consultorioHistoryForm].map((entry, index, entries) => {
                  const item = (entry || {}) as Record<string, unknown>;
                  return <article key={`${String(item.submittedAt || index)}-${index}`} className={`cokifimi-member-history-item ${consultorioStatusLabel(item) === "Solicitud rechazada" ? "is-rejected" : ""}`}>
                    <strong>{index === entries.length - 1 ? "Estado actual" : `Solicitud ${index + 1}`}</strong>
                    <div><CalendarDays /><span>Fecha solicitada</span><b>{formatDateOnly(String(item.submittedAt || ""))}</b></div>
                    <div><CalendarDays /><span>Fecha inicio</span><b>{formatDateOnly(String(item.certificadoVigenciaDesde || ""))}</b></div>
                    <div><CalendarDays /><span>Fecha fin</span><b>{formatDateOnly(String(item.certificadoVigenciaHasta || ""))}</b></div>
                    <div><CircleDollarSign /><span>Monto</span><b>{item.importeConfirmado ? `$ ${Number(item.importeConfirmado).toLocaleString("es-AR")}` : "Sin informar"}</b></div>
                    <div><Activity /><span>Estado</span><b>{consultorioStatusLabel(item)}</b></div><div className="cokifimi-member-history-resolution"><Clock3 /><span>{consultorioStatusLabel(item) === "Solicitud aprobada" ? "Fecha y hora de aprobación" : consultorioStatusLabel(item) === "Solicitud rechazada" ? "Fecha y hora de rechazo" : "Fecha y hora de actualización"}</span><b>{item.validadoAt || item.rechazadoAt || item.resueltoAt ? new Date(String(item.validadoAt || item.rechazadoAt || item.resueltoAt)).toLocaleString("es-AR") : "Sin informar"}</b></div>
                    <div className="cokifimi-member-history-message"><MessageSquareText /><span>Mensaje</span><b>{String(item.mensajeAdmin || "Sin mensaje informado")}</b></div>
                  </article>;
                })}
              </div>
            </div>
          </div>
        ), document.body)}        {screen === "dashboard" && (!record || record.memberProvisional) && (
          <div className="cokifimi-member-content">
            <div className="cokifimi-member-intro">
              <FilePenLine />
              <h2>Aún no tiene una declaración cargada</h2>
              <p>
                Su acceso ya está creado. Cuando esté listo/a, complete su
                primera declaración jurada desde este espacio privado.
              </p>
            </div>
            <div className="cokifimi-member-actions">
              <button
                type="button"
                onClick={() => {
                  setPendingRecord(null);
                  setScreen("form");
                }}
              >
                <FilePenLine /> Crear mi declaración
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
