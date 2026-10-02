import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  CircleDollarSign,
  Clock3,
  CalendarClock,
  Download,
  Eye,
  FileCheck,
  FileX2,
  Search,
  Receipt,
  X,
  Pencil,
  Trash2,
  History,
  UserRound,
  MessageSquareText,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Activity,
} from "lucide-react";
import { DeclarationData } from "../types";
import { normalizeMisionesLocality } from "../data/misionesLocalities";
import ConsultorioHabilitacionForm, { ConsultorioHabilitacionPreview } from "./ConsultorioHabilitacionForm";
import { generateAutomaticCertificates } from "../utils/certificates";
import { isServerConfigured, loadServerRecord, notifyConsultorioResolution } from "../api";
import RecordPhoto from "./RecordPhoto";

type Props = {
  declarations: DeclarationData[];
  onUpdate: (data: DeclarationData) => void | Promise<DeclarationData | void>;
  onClose: () => void;
  initialRequestId?: string | null;
  beforeSearch?: ReactNode;
  onDelete: (id: string, solicitudId?: string, domicilio?: string) => void | Promise<void>;
  onDeleteAll: () => void | Promise<void>;
  onEditingChange?: (editing: boolean) => void;
};

const normalizedMatricula = (value: unknown) => String(value ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().replace(/^0+(?=\d)/, '');const normalizeConsultorioAddressValue = (value: unknown) => {
  const tokens = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bN(?:[^A-Z0-9]|\\s)*/gi, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.filter((token, index) => token !== tokens[index - 1]).join('');
};
const consultorioRequestAddressKey = (form: Record<string, unknown> | undefined) => normalizeConsultorioAddressValue([
  form?.domicilioConsultorio,
  form?.numeroConsultorio,
  form?.localidadConsultorio,
].filter(Boolean).join(' '));
const consultorioHistorySnapshot = (form: Record<string, unknown>) => ({
  submittedAt: String(form.submittedAt || ""),
  certificadoVigenciaDesde: String(form.certificadoVigenciaDesde || ""),
  certificadoVigenciaHasta: String(form.certificadoVigenciaHasta || ""),
  importeConfirmado: String(form.importeConfirmado || ""),
  estadoAdmin: String(form.estadoAdmin || ""),
  estadoImporte: String(form.estadoImporte || ""),
  estadoPago: String(form.estadoPago || ""),
  mensajeAdmin: String(form.mensajeAdmin || form.descripcionCertificado || ""),
  resueltoAt: String(form.validadoAt || form.rechazadoAt || form.resueltoAt || ""),
  registradoAt: new Date().toISOString(),
});
const findProfessionalByMatricula = (matricula: unknown, declarations: DeclarationData[], currentId: string) => {
  const normalized = normalizedMatricula(matricula);
  if (!normalized) return undefined;
  return declarations.find((candidate) => candidate.id !== currentId && normalizedMatricula(candidate.matricula) === normalized);
};
const downloadAdminAttachment = (content: string, filename: string) => {
  const link = document.createElement("a");
  link.href = content;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};
function RequestVerificationSteps({ form, approved, rejected }: { form: Record<string, string | boolean | undefined>; approved: boolean; rejected: boolean }) {
  const amountConfirmed = form.estadoImporte === "IMPORTE_CONFIRMADO";
  const paymentReceived = form.estadoPago === "COMPROBANTE_RECIBIDO" || form.estadoPago === "PAGO_VALIDADO";
  const paymentValidated = form.estadoPago === "PAGO_VALIDADO";
  const steps = [
    { label: "Solicitud presentada", done: Boolean(form.submittedAt), icon: FileCheck },
    { label: "Importe verificado", done: amountConfirmed, icon: CircleDollarSign },
    { label: "Pago comprobado", done: paymentReceived, icon: Receipt },
    { label: rejected ? "Solicitud rechazada" : approved ? "Alta aprobada" : "Pendiente de aprobación", done: approved || rejected, icon: rejected ? FileX2 : approved ? CheckCircle2 : Clock3 },
  ];
  if (form.estadoPago === "COMPROBANTE_RECIBIDO" && !approved && !rejected) {
    steps[3].label = "Pendiente de aprobar pago y dar el alta";
  }
  return <div className={`cokifimi-request-verification-steps ${rejected ? "is-rejected" : approved ? "is-approved" : ""}`}><strong>Seguimiento de verificación</strong><div>{steps.map(({ label, done, icon: Icon }) => <span key={label} className={done ? "is-done" : ""}><i><Icon /></i><small>{label}</small></span>)}</div>{paymentValidated && !approved && !rejected && <em>Pago validado · falta emitir el alta</em>}</div>;
}

function RequestValidity({ form, approved }: { form: Record<string, string | boolean | undefined>; approved: boolean }) {
  if (!approved) return null;
  const source = String(form.certificadoVigenciaDesde || form.validadoAt || form.submittedAt || "");
  const parse = (value: string) => {
    const text = String(value || '').trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const reversed = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (reversed) return new Date(Number(reversed[3]), Number(reversed[2]) - 1, Number(reversed[1]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const from = parse(source); if (!from) return null;
  const storedTo = parse(String(form.certificadoVigenciaHasta || ""));
  const to = storedTo || new Date(from);
  if (!storedTo) { const months = Number(String(form.mesesHabilitacion || form.periodoHabilitacion || "").match(/6|12|24/)?.[0] || 6); to.setMonth(to.getMonth() + months); }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((to.getTime() - today.getTime()) / 86400000);
  return <div className={`cokifimi-request-validity ${days < 0 ? "is-expired" : days <= 7 ? "is-warning" : ""}`}><CalendarClock /><div><small>Vencimiento de habilitación</small><strong>{to.toLocaleDateString("es-AR")}</strong><span>{days < 0 ? `Vencida hace ${Math.abs(days)} días` : days === 0 ? "Vence hoy" : `${days} días restantes`}</span></div></div>;
}

export default function ConsultorioRequestsPanel({
  declarations,
  onUpdate,
  onClose,
  initialRequestId,
  beforeSearch,
  onDelete,
  onDeleteAll,
  onEditingChange,
}: Props) {
  const [deletedRequestKeys, setDeletedRequestKeys] = useState<string[]>([]);
  const requestDeclarations = (() => {
    const seen = new Set<string>();
    return declarations.flatMap((item) => [
      ...(item.formularioHabilitacionConsultorio?.submittedAt ? [item] : []),
      ...(item.consultorioSolicitudes || []).map((request) => { const requestId = request.id || String(request.formularioHabilitacionConsultorio?.consultorioSolicitudId || "").trim(); return { ...item, ...(requestId ? { consultorioSolicitudId: requestId } : {}), formularioHabilitacionConsultorio: request.formularioHabilitacionConsultorio }; }),
    ] as DeclarationData[]).filter((item) => {
      // Cada Alta es independiente; los duplicados deben poder eliminarse por su ID.
      const key = item.id + ":" + (item.consultorioSolicitudId || (item.formularioHabilitacionConsultorio?.nuevaSolicitudConsultorio ? `address:${consultorioRequestAddressKey(item.formularioHabilitacionConsultorio)}` : "principal"));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })().filter((item) => !deletedRequestKeys.includes(`${item.id}:${item.consultorioSolicitudId || "principal"}`));
  const [openingRequestId, setOpeningRequestId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DeclarationData | null>(() =>
    initialRequestId
      ? requestDeclarations.find((item) => item.id === initialRequestId) || null
      : null,
  );  useEffect(() => {
    if (!selected) return;
    const selectedKey = `${selected.id}:${selected.consultorioSolicitudId || "principal"}`;
    const fresh = requestDeclarations.find((item) =>
      `${item.id}:${item.consultorioSolicitudId || "principal"}` === selectedKey,
    );
    if (!fresh) return;
    const currentForm = selected.formularioHabilitacionConsultorio || {};
    const freshForm = fresh.formularioHabilitacionConsultorio || {};
    const freshPaymentFile = String(freshForm.comprobantePagoArchivo || freshForm.comprobantePagoUrl || "");
    const currentPaymentFile = String(currentForm.comprobantePagoArchivo || currentForm.comprobantePagoUrl || "");
    const paymentStateChanged =
      String(currentForm.comprobantePagoAt || "") !== String(freshForm.comprobantePagoAt || "") ||
      String(currentForm.estadoPago || "") !== String(freshForm.estadoPago || "");
    const paymentFileUpdated = Boolean(freshPaymentFile) && freshPaymentFile !== currentPaymentFile;
    if (paymentStateChanged || paymentFileUpdated) {
      const mergedForm = { ...currentForm, ...freshForm } as Record<string, string | boolean | undefined>;
      Object.entries(currentForm).forEach(([key, value]) => {
        const isAttachment = /(?:Archivo|Url|Mime|Id|Nombre|Adjunto\d*)$/i.test(key);
        if (isAttachment && value && !freshForm[key]) mergedForm[key] = value;
      });
      setSelected({
        ...fresh,
        consultorioSolicitudId: selected.consultorioSolicitudId,
        formularioHabilitacionConsultorio: mergedForm,
      });
    }
  }, [requestDeclarations, selected?.id, selected?.consultorioSolicitudId, selected?.formularioHabilitacionConsultorio?.comprobantePagoAt, selected?.formularioHabilitacionConsultorio?.estadoPago, selected?.formularioHabilitacionConsultorio?.comprobantePagoArchivo]);
  const keepSelectedRequest = (saved: DeclarationData, source: DeclarationData): DeclarationData => {
    const requestId = source.consultorioSolicitudId;
    if (!requestId) return saved;
    const request = (saved.consultorioSolicitudes || []).find((item) => item.id === requestId);
    return request
      ? { ...saved, consultorioSolicitudId: requestId, formularioHabilitacionConsultorio: request.formularioHabilitacionConsultorio }
      : { ...saved, consultorioSolicitudId: requestId, formularioHabilitacionConsultorio: source.formularioHabilitacionConsultorio };
  };
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");  const [certificateFrom, setCertificateFrom] = useState(() => new Date().toISOString().slice(0, 10));  const [certificateTo, setCertificateTo] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<"approve" | "reject" | null>(null);
  const [resolutionResult, setResolutionResult] = useState<{
    id: string;
    approved: boolean;
  } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<DeclarationData | null>(null);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showCreateAltaModal, setShowCreateAltaModal] = useState(false);
  const [createAltaTargetId, setCreateAltaTargetId] = useState<string>("");
  const [createAltaSearch, setCreateAltaSearch] = useState("");
  const [altaSaveMode, setAltaSaveMode] = useState<"create" | "update">("update");
  const requestsListRef = useRef<HTMLDivElement>(null);
  const [editingConsultorio, setEditingConsultorio] = useState<DeclarationData | null>(null);  const [updatedConsultorioId, setUpdatedConsultorioId] = useState<string | null>(null);
  const [showUpdatedModal, setShowUpdatedModal] = useState(false);
  const [historyItem, setHistoryItem] = useState<DeclarationData | null>(null);
  const [savingConsultorio, setSavingConsultorio] = useState(false);
  const [updatedModalTitle, setUpdatedModalTitle] = useState("ACTUALIZADO");
  const [updatedModalMessage, setUpdatedModalMessage] = useState("El alta de consultorio fue actualizada correctamente.");
  const hasActiveAlta = (item: DeclarationData) => {
    const form = item.formularioHabilitacionConsultorio || {};
    const isApproved = form.estadoAdmin === "APROBADO" || form.validadoAdmin === true;
    const hasVigenciaDates = Boolean(form.certificadoVigenciaDesde || form.certificadoVigenciaHasta || form.validadoAt);
    if (!isApproved && !hasVigenciaDates) return false;
    const explicitExpiry = form.certificadoVigenciaHasta
      ? new Date(`${String(form.certificadoVigenciaHasta)}T23:59:59`)
      : null;
    const derivedExpiry = (() => {
      const source = String(form.certificadoVigenciaDesde || form.validadoAt || "");
      if (!source) return null;
      const start = new Date(source);
      if (Number.isNaN(start.getTime())) return null;
      const months = Number(String(form.mesesHabilitacion || form.periodoHabilitacion || "").match(/6|12|24/)?.[0] || "0");
      if (!months) return null;
      start.setMonth(start.getMonth() + months);
      return start;
    })();
    const expiryDate = explicitExpiry || derivedExpiry;
    if (!expiryDate) {
      return isApproved || form.validadoAdmin === true;
    }
    return expiryDate >= new Date();
  };
  const hasActiveBianualDeclaration = (item: DeclarationData) => {
    if (!item.fechaPresentacion || !item.fechaVencimiento) return false;
    const presentationDate = new Date(`${item.fechaPresentacion}T00:00:00`);
    const expiryDate = new Date(`${item.fechaVencimiento}T23:59:59`);
    if (Number.isNaN(presentationDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
      return false;
    }
    const normalizedName = `${item.apellido || ""} ${item.nombres || ""}`.trim().toLowerCase();
    const hasRealIdentity = Boolean(
      item.apellido &&
      item.nombres &&
      item.dni &&
      item.matricula &&
      !/(sin declaraci[oó]n|colegiado\s+sin|sin datos|pendiente)/i.test(normalizedName),
    );
    return hasRealIdentity && presentationDate <= new Date() && expiryDate >= new Date();
  };
  const normalizeConsultorioAddress = (value: string) => normalizeConsultorioAddressValue(value);
  const hasFreeConsultorioAddress = (item: DeclarationData) => {
    const usedAddresses = new Set(
      [
        item.formularioHabilitacionConsultorio,
        ...(item.consultorioSolicitudes || []).map((request) => request.formularioHabilitacionConsultorio),
      ]
        .filter(Boolean)
        .map((form) => {
          const address = `${form?.domicilioConsultorio || ""} ${form?.numeroConsultorio || ""} ${form?.localidadConsultorio || ""}`.trim();
          return address ? normalizeConsultorioAddress(address) : "";
        })
        .filter(Boolean),
    );
    return (item.consultorios || []).some((consultorio) => {
      const address = `${consultorio.domicilio || ""} ${consultorio.numeracion || ""} ${consultorio.ciudad || ""}`.trim();
      return Boolean(address) && !usedAddresses.has(normalizeConsultorioAddress(address));
    });
  };
  const canCreateAlta = (item: DeclarationData) => {
    const totalAltasRealizadas = Number(Boolean(item.formularioHabilitacionConsultorio?.submittedAt)) + (item.consultorioSolicitudes?.length || 0);
    return hasActiveBianualDeclaration(item) && totalAltasRealizadas < 3 && hasFreeConsultorioAddress(item);
  };
  const createAltaCandidates = useMemo(() => declarations.filter((item) => hasActiveBianualDeclaration(item)), [declarations]);
  const filteredCreateAltaCandidates = useMemo(() => {
    const query = createAltaSearch.trim().toLowerCase();
    if (!query) {
      return createAltaCandidates;
    }
    return createAltaCandidates.filter((item) => {
      const haystack = `${item.apellido} ${item.nombres} ${item.dni} ${item.matricula}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [createAltaCandidates, createAltaSearch]);
  useEffect(() => {
    onEditingChange?.(Boolean(editingConsultorio));
  }, [editingConsultorio, onEditingChange]);
  useEffect(() => {
    if (selected || !resolutionResult) return;
    const timer = window.setTimeout(() => {
      requestsListRef.current
        ?.querySelector<HTMLElement>(
          `[data-consultorio-request-id="${resolutionResult.id}"]`,
        )
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selected, resolutionResult]);
  useEffect(() => {
    if (!editingConsultorio) return;
    const timer = window.setTimeout(() => {
      const formHeader = document.querySelector<HTMLElement>(
        ".cokifimi-consultorio-wizard-header",
      );
      if (formHeader) {
        formHeader.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [editingConsultorio]);
  const focusUpdatedConsultorioCard = (id: string) => {
    const card = document.querySelector<HTMLElement>(
      `[data-consultorio-request-id="${id}"]`,
    );
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-updated");
    card.style.outline = "3px solid #22c55e";
    card.style.outlineOffset = "2px";
  };
  useEffect(() => {
    if (!updatedConsultorioId || !showUpdatedModal) return;
    const timer = window.setTimeout(() => {
      focusUpdatedConsultorioCard(updatedConsultorioId);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [updatedConsultorioId, showUpdatedModal]);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      const box = document.querySelector<HTMLElement>(
        ".cokifimi-consultorio-review-box",
      );
      if (!box) return;
      box.querySelector(".cokifimi-payment-admin-controls")?.remove();
      const form = selected.formularioHabilitacionConsultorio || {};
      const amountStatus = String(
        form.estadoImporte || "PENDIENTE_VERIFICACION",
      );
      const paymentStatus = String(form.estadoPago || "SIN_COMPROBANTE");
      const monthlyFee = Number(
        window.localStorage.getItem("cokifimi_habilitacion_monthly_fee") ||
          15000,
      );
      const suggestedAmount =
        Number(form.importeEstimado || 0) || 0;
      const confirmedAmount = Number(form.importeConfirmado || form.importeEstimado || 0) || 0;
      const requestType =
        String(form.renovacionHabilitacion || "").toUpperCase() === "SI"
          ? "Renovación"
          : "Nueva habilitación";
      const controls = document.createElement("div");
      controls.className = "cokifimi-payment-admin-controls";
      if (amountStatus !== "IMPORTE_CONFIRMADO") {
        controls.innerHTML = `<div class="cokifimi-admin-request-period"><small>Solicitud del colegiado</small><strong>${requestType}</strong><span>La vigencia será definida por Administración.</span></div><strong>Paso 1 de 3 · Confirmar importe antes del pago</strong><span>Indique primero las fechas de vigencia y luego el importe definitivo.</span><ol><li>Defina la fecha inicial y final.</li><li>Revise o edite el importe calculado.</li><li>Confirme el importe para informar al colegiado.</li></ol><div class="cokifimi-admin-amount-dates"><label>Vigencia desde<input class="cokifimi-admin-validity-from" type="date"></label><label>Vigencia hasta <strong class="cokifimi-required-mark">*</strong><input class="cokifimi-admin-validity-to" type="date" required aria-required="true"></label></div><label>Importe definitivo<div class="cokifimi-admin-amount-input"><span>$</span><input class="cokifimi-admin-amount" type="text" inputmode="numeric" autocomplete="off" disabled></div></label><button type="button" disabled>Confirmar importe al colegiado</button>`; const fromInput = controls.querySelector<HTMLInputElement>(".cokifimi-admin-validity-from"); const toInput = controls.querySelector<HTMLInputElement>(".cokifimi-admin-validity-to"); const input = controls.querySelector<HTMLInputElement>(".cokifimi-admin-amount"); const confirmButton = controls.querySelector<HTMLButtonElement>("button"); fromInput!.value = String(form.certificadoVigenciaDesde || new Date().toISOString().slice(0, 10)); toInput!.value = String(form.certificadoVigenciaHasta || ""); input!.value = String(suggestedAmount); const updateAmountState = () => { const validDates = Boolean(fromInput?.value && toInput?.value && toInput.value > fromInput.value); if (input) input.disabled = !validDates; if (confirmButton) confirmButton.disabled = !validDates; if (validDates && Number(form.importeEstimado || 0) <= 0) { const days = Math.max(1, Math.ceil((new Date(`${toInput!.value}T00:00:00`).getTime() - new Date(`${fromInput!.value}T00:00:00`).getTime()) / 86400000)); input!.value = String(Math.max(1, Math.ceil(days / 30) * monthlyFee)); } }; fromInput?.addEventListener("change", updateAmountState); toInput?.addEventListener("change", updateAmountState); updateAmountState(); controls.querySelector("button")?.addEventListener("click", async () => {
          if (!fromInput?.value || !toInput?.value || toInput.value <= fromInput.value) { window.alert("La fecha de vigencia hasta es obligatoria y debe ser posterior a la fecha inicial."); return; }
          setCertificateFrom(fromInput.value); setCertificateTo(toInput.value);
          const amount = Math.max(0, Number(input.value) || 0);
          const next = {
            ...selected,
            formularioHabilitacionConsultorio: {
              ...form,
              importeConfirmado: String(amount),
              importeEstimado: String(amount),
              certificadoVigenciaDesde: fromInput?.value || "",
              certificadoVigenciaHasta: toInput?.value || "",
              estadoImporte: "IMPORTE_CONFIRMADO",
              estadoPago: "SIN_COMPROBANTE",
              estadoAdmin: "PENDIENTE",
              validadoAdmin: false,
              certificadoNombre: "",
              certificadoUrl: "",
              certificadoConsultorioNombre: "",
              certificadoConsultorioUrl: "",
              certificadoEticaNombre: "",
              certificadoEticaUrl: "",
              importeConfirmadoAt: new Date().toISOString(),
            },
          };
          const confirmButton = controls.querySelector<HTMLButtonElement>("button");
          if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.innerHTML = '<span class="cokifimi-payment-spinner" aria-hidden="true">⟳</span> Cargando...';
          }
          setUpdatedModalTitle("ENVIANDO IMPORTE");
          setUpdatedModalMessage("Aguarde, estamos informando el importe al colegiado.");
          setShowUpdatedModal(true);
          try {
            const saved = (await onUpdate(next)) || next;
            setSelected(keepSelectedRequest(saved, selected));
            setUpdatedConsultorioId(selected.id);
            setSelected(null);
            setUpdatedModalTitle("IMPORTE ENVIADO");
            setUpdatedModalMessage("El importe fue informado al colegiado correctamente.");

            if (confirmButton) {
              confirmButton.innerHTML = "✓ Enviado";
              confirmButton.classList.add("is-sent");
            }
          } catch (error) {
            if (confirmButton) {
              confirmButton.disabled = false;
              confirmButton.textContent = "Confirmar importe al colegiado";
            }
            setShowUpdatedModal(false);
            window.alert(error instanceof Error ? error.message : "No se pudo confirmar el importe.");
          }
        });
      } else if (paymentStatus === "COMPROBANTE_RECIBIDO") {
        controls.innerHTML =
          '<strong>Paso 2 de 3 · Comprobante recibido</strong><div class="cokifimi-admin-informed-amount"><small>Importe informado al colegiado</small><strong>$ ' + confirmedAmount.toLocaleString("es-AR") + '</strong></div><span>Verifique el comprobante adjunto y confirme que el importe abonado sea correcto.</span><div class="cokifimi-payment-admin-actions"><button type="button" class="is-view-receipt">Ver comprobante</button><button type="button" class="is-validate-payment">Validar pago</button></div><label class="cokifimi-payment-admin-file-upload"><span>Adjuntar factura de pago</span><div class="cokifimi-payment-admin-file-row"><label class="cokifimi-payment-admin-file-button" for="cokifimi-payment-admin-invoice-upload">Seleccionar archivo</label><input id="cokifimi-payment-admin-invoice-upload" type="file" accept="image/*,.pdf,application/pdf" /><small>Ningún archivo seleccionado</small></div></label>';
        controls
          .querySelector(".is-view-receipt")
          ?.addEventListener("click", async () => {
            let currentForm = form;
            if (isServerConfigured()) {
              try {
                const freshRecord = await loadServerRecord(selected.id);
                const requestId = selected.consultorioSolicitudId;
                if (requestId) {
                  const freshRequest = freshRecord.consultorioSolicitudes?.find((entry) => entry.id === requestId);
                  if (freshRequest?.formularioHabilitacionConsultorio) currentForm = freshRequest.formularioHabilitacionConsultorio;
                } else if (freshRecord.formularioHabilitacionConsultorio) {
                  currentForm = freshRecord.formularioHabilitacionConsultorio;
                }
              } catch (error) {
                console.warn("No se pudo refrescar el comprobante antes de visualizarlo.", error);
              }
            }
            const file = String(currentForm.comprobantePagoArchivo || currentForm.comprobantePagoUrl || "");
            if (!file) {
              window.alert("El comprobante todavía no está disponible en el servidor.");
              return;
            }
            const modal = document.createElement("div");
            modal.className = "cokifimi-payment-receipt-modal";
            modal.style.setProperty("z-index", "2147483647", "important");
            const card = document.createElement("div");
            card.className = "cokifimi-payment-receipt-dialog";
            const header = document.createElement("header");
            header.innerHTML =
              '<strong>Comprobante de pago</strong><button type="button">Cerrar</button>';
            header
              .querySelector("button")
              ?.addEventListener("click", () => modal.remove());
            card.appendChild(header);
            if (file.toLowerCase().startsWith("data:image/")) {
              const image = document.createElement("img");
              image.src = file;
              image.alt = "Comprobante de pago";
              card.appendChild(image);
            } else {
              const frame = document.createElement("iframe");
              frame.src = file;
              frame.title = "Comprobante de pago";
              card.appendChild(frame);
            }
            modal.appendChild(card);
            modal.addEventListener("click", (event) => {
              if (event.target === modal) modal.remove();
            });
            document.body.appendChild(modal);
          });
        const paymentReceiptInput = controls.querySelector<HTMLInputElement>(".cokifimi-payment-admin-file-upload input");
        const paymentReceiptLabel = controls.querySelector<HTMLElement>(".cokifimi-payment-admin-file-upload small");
        paymentReceiptInput?.addEventListener("change", () => {
          const selectedName = paymentReceiptInput.files?.[0]?.name || "Ningún archivo seleccionado";
          if (paymentReceiptLabel) {
            paymentReceiptLabel.textContent = selectedName;
          }
        });
        controls
          .querySelector(".is-validate-payment")
          ?.addEventListener("click", () => {
            const file = paymentReceiptInput?.files?.[0];
            if (!file) {
              window.alert("Adjunte la factura de pago antes de validar el pago.");
              return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
              const next = {
                ...selected,
                formularioHabilitacionConsultorio: {
                  ...form,
                  reciboPagoArchivo: String(reader.result || ""),
                  reciboPagoNombre: file.name,
                  estadoPago: "PAGO_VALIDADO",
                  estadoAdmin: "PENDIENTE",
                  validadoAdmin: false,
                  certificadoNombre: "",
                  certificadoUrl: "",
                  certificadoConsultorioNombre: "",
                  certificadoConsultorioUrl: "",
                  certificadoEticaNombre: "",
                  certificadoEticaUrl: "",
                  pagoValidadoAt: new Date().toISOString(),
                },
              };
              const validateButton = controls.querySelector<HTMLButtonElement>(".is-validate-payment");
              if (validateButton) {
                validateButton.disabled = true;
                validateButton.innerHTML = '<span class="cokifimi-payment-spinner" aria-hidden="true">⟳</span> Enviando...';
              }
              setUpdatedModalTitle("ENVIANDO COMPROBANTE");
              setUpdatedModalMessage("Aguarde mientras guardamos la factura de pago.");
              setShowUpdatedModal(true);
              try {
                const saved = (await onUpdate(next)) || next;
                setSelected(keepSelectedRequest(saved, selected));
                // Mantener abierta la resolución para que Administración pueda emitir los certificados.
                setUpdatedModalTitle("COMPROBANTE ENVIADO");
                setUpdatedModalMessage("El comprobante fue enviado correctamente al colegiado.");
                if (validateButton) {
                  validateButton.innerHTML = '✓ Enviado';
                  validateButton.classList.add("is-sent");
                }
              } catch (error) {
                if (validateButton) {
                  validateButton.disabled = false;
                  validateButton.textContent = "Validar pago";
                }
                setShowUpdatedModal(false);
                window.alert(error instanceof Error ? error.message : "No se pudo enviar la factura.");
              }
            };
            reader.readAsDataURL(file);
          });
      } else if (paymentStatus === "PAGO_VALIDADO") {
        controls.innerHTML =
          '<strong>Paso 3 de 3 · Pago validado</strong><div class="cokifimi-admin-informed-amount"><small>Importe informado al colegiado</small><strong>$ ' + confirmedAmount.toLocaleString("es-AR") + '</strong></div><span>El pago fue validado. Ahora puede aprobar la solicitud y emitir los dos certificados.</span>';
      } else {
        controls.innerHTML =
          "<strong>Esperando comprobante</strong><div class=\"cokifimi-admin-informed-amount\"><small>Importe informado al colegiado</small><strong>$ " + confirmedAmount.toLocaleString("es-AR") + "</strong></div><span>El colegiado todavía no informó el pago.</span>";
      }
      box.prepend(controls);
      const approve = box.querySelector<HTMLButtonElement>(".is-approve");
      if (approve) {
        approve.disabled = paymentStatus !== "PAGO_VALIDADO";
        approve.title =
          paymentStatus === "PAGO_VALIDADO"
            ? "Aprobar solicitud y emitir certificados"
            : "Debe validar primero el comprobante de pago";
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected, resolutionOpen]);
  useEffect(() => {
    const closeResolutionModal = (event: MouseEvent) => {
      const box = document.querySelector<HTMLElement>(
        ".cokifimi-consultorio-review-box.is-modal-open",
      );
      if (
        !box ||
        !(event.target instanceof Node) ||
        !box.contains(event.target)
      )
        return;
      const bounds = box.getBoundingClientRect();
      if (
        event.clientX >= bounds.right - 64 &&
        event.clientY <= bounds.top + 64
      )
        setResolutionOpen(false);
    };
    document.addEventListener("click", closeResolutionModal);
    return () => document.removeEventListener("click", closeResolutionModal);
  }, []);
  const requests = useMemo(
    () =>
      requestDeclarations
        .filter((item) =>
          Boolean(item.formularioHabilitacionConsultorio?.submittedAt),
        )
        .filter((item) =>
          `${item.apellido} ${item.nombres} ${item.matricula} ${item.dni}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((left, right) => {
          const statusRank = (item: DeclarationData) => {
            const form = item.formularioHabilitacionConsultorio || {};
            if (form.estadoAdmin === "RECHAZADO") return 1;
            if (form.estadoAdmin === "APROBADO" || form.validadoAdmin === true) return 2;
            return 0;
          };
          const rankDifference = statusRank(left) - statusRank(right);
          if (rankDifference !== 0) return rankDifference;
          const leftDate = Date.parse(String(left.formularioHabilitacionConsultorio?.submittedAt || left.updatedAt || left.createdAt || "")) || 0;
          const rightDate = Date.parse(String(right.formularioHabilitacionConsultorio?.submittedAt || right.updatedAt || right.createdAt || "")) || 0;
          if (rightDate !== leftDate) return rightDate - leftDate;
          const leftIsAdditional = Boolean(left.consultorioSolicitudId);
          const rightIsAdditional = Boolean(right.consultorioSolicitudId);
          return Number(rightIsAdditional) - Number(leftIsAdditional);
        }),
    [requestDeclarations, query],
  );
  const allRequests = useMemo(
    () =>
      requestDeclarations.filter((item) =>
        Boolean(item.formularioHabilitacionConsultorio?.submittedAt),
      ),
    [requestDeclarations],
  );
  const approvedCount = allRequests.filter(
    (item) =>
      item.formularioHabilitacionConsultorio?.estadoAdmin === "APROBADO" ||
      item.formularioHabilitacionConsultorio?.validadoAdmin === true,
  ).length;
  const rejectedCount = allRequests.filter(
    (item) =>
      item.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO",
  ).length;
  const pendingCount = allRequests.length - approvedCount - rejectedCount;
  const localityCounts = allRequests.reduce<Record<string, number>>(
    (counts, item) => {
      const rawLocality = String(item.formularioHabilitacionConsultorio?.localidadConsultorio || item.municipioLocalidad || "").trim();
      const locality = rawLocality ? normalizeMisionesLocality(rawLocality) : "Sin localidad";
      counts[locality] = (counts[locality] || 0) + 1;
      return counts;
    },
    {},
  );
  const choose = async (item: DeclarationData) => {
    const requestKey = `${item.id}:${item.consultorioSolicitudId || "principal"}`;
    setOpeningRequestId(requestKey);
    try {
      let complete = item;
      if (isServerConfigured()) {
        try {
          const loaded = await loadServerRecord(item.id);
          const requestId = item.consultorioSolicitudId;
          if (requestId) {
            const request = loaded.consultorioSolicitudes?.find((entry) => entry.id === requestId);
            complete = request
              ? { ...loaded, consultorioSolicitudId: requestId, formularioHabilitacionConsultorio: request.formularioHabilitacionConsultorio }
              : item;
          } else complete = loaded;
        } catch (error) {
          console.warn("No se pudo cargar el detalle completo de la solicitud.", error);
        }
      }
      const form = complete.formularioHabilitacionConsultorio || {};
      setResolutionResult(null);
      setResolutionAction(null);
      setResolutionOpen(false);
      setSelected(complete);
      setMessage(String(form.mensajeAdmin || form.descripcionCertificado || ""));
      setCertificateFrom(String(form.certificadoVigenciaDesde || new Date().toISOString().slice(0, 10)));
      setCertificateTo(String(form.certificadoVigenciaHasta || ""));
      window.setTimeout(() => document.querySelector<HTMLElement>(".cokifimi-consultorio-preview-toolbar")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } finally {
      setOpeningRequestId(null);
    }
  };  const requestEdit = async (item: DeclarationData) => {
    setAltaSaveMode("update");
    const requestKey = `${item.id}:${item.consultorioSolicitudId || "principal"}`;
    setOpeningRequestId(requestKey);
    try {
      let complete = item;
      if (isServerConfigured()) {
        try {
          const loaded = await loadServerRecord(item.id);
          const requestId = item.consultorioSolicitudId;
          if (requestId) {
            const request = loaded.consultorioSolicitudes?.find((entry) => entry.id === requestId);
            complete = request
              ? { ...loaded, consultorioSolicitudId: requestId, formularioHabilitacionConsultorio: request.formularioHabilitacionConsultorio }
              : loaded;
          } else {
            complete = loaded;
          }
        } catch (error) {
          console.warn("No se pudo cargar el detalle completo para editar el alta.", error);
        }
      }
      setEditingConsultorio(complete);
    } finally {
      setOpeningRequestId(null);
    }
  };
  const clearAllConsultorios = async () => {
    if (!isServerConfigured()) {
      window.alert("La eliminación masiva requiere conexión con el servidor.");
      return;
    }
    const confirmation = window.prompt("Esta acción eliminará TODAS las altas del servidor, conservando las declaraciones. Escriba ELIMINAR TODO para confirmar:");
    if (confirmation?.trim().toUpperCase() !== "ELIMINAR TODO") return;
    setClearingAll(true);
    try {
      await onDeleteAll();
      setDeletedRequestKeys([]);
      setShowDeleteSuccessModal(true);
      window.setTimeout(() => setShowDeleteSuccessModal(false), 2600);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudieron eliminar todas las altas.");
    } finally {
      setClearingAll(false);
    }
  };

  const requestDelete = (item: DeclarationData) => {
    // La tarjeta principal nunca debe resolver el ID de otra Alta por domicilio.
    setDeleteConfirmation("");
    setDeleteCandidate(item.consultorioSolicitudId ? { ...item, consultorioSolicitudId: item.consultorioSolicitudId } : item);
  };
  const confirmDelete = async () => {
    if (!deleteCandidate || deleteConfirmation.trim().toUpperCase() !== "ELIMINAR") return;
    const targetId = deleteCandidate.id;
    const targetRequestId = deleteCandidate.consultorioSolicitudId || undefined;
    const targetForm = deleteCandidate.formularioHabilitacionConsultorio || {};
    const targetAddress = [targetForm.domicilioConsultorio, targetForm.numeroConsultorio, targetForm.localidadConsultorio].filter(Boolean).join(" ").trim();
    if (targetForm.nuevaSolicitudConsultorio && !targetRequestId && !targetAddress) {
      window.alert("No se pudo identificar el domicilio de esta alta. No se eliminó ningún registro.");
      return;
    }
    setDeleteCandidate(null);
    setDeleteConfirmation("");
    try {
      await onDelete(targetId, targetRequestId, targetAddress);
      setDeletedRequestKeys((current) => {
        const key = `${targetId}:${targetRequestId || `address:${consultorioRequestAddressKey(deleteCandidate.formularioHabilitacionConsultorio || {})}`}`;
        return current.includes(key) ? current : [...current, key];
      });
      setShowDeleteSuccessModal(true);
      setSelected((current) => {
        if (!current) return current;
        if (current.id !== targetId) return current;
        return current.consultorioSolicitudId === targetRequestId ? null : current;
      });
      window.setTimeout(() => setShowDeleteSuccessModal(false), 2200);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo eliminar la solicitud.");
    }
  };
  const createAltaForMember = () => {
    if (!createAltaTargetId) {
      window.alert("Seleccione un colegiado con declaración bianual vigente.");
      return;
    }
    const target = declarations.find((item) => item.id === createAltaTargetId);
    if (!target) return;
    const totalAltasRealizadas = Number(Boolean(target.formularioHabilitacionConsultorio?.submittedAt)) + (target.consultorioSolicitudes?.length || 0);
    if (totalAltasRealizadas >= 3) {
      window.alert("Este colegiado ya tiene 3 altas registradas. No puede cargar otra nueva.");
      return;
    }
    if (!hasFreeConsultorioAddress(target)) {
      window.alert("Este colegiado no tiene un domicilio libre disponible para seleccionar en el formulario de alta.");
      return;
    }
    const newRequestId = `alta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const next = {
      ...target,
      consultorioSolicitudId: newRequestId,
      consultorioSolicitudes: [
        ...(target.consultorioSolicitudes || []),
        {
          id: newRequestId,
          formularioHabilitacionConsultorio: {
            consultorioSolicitudId: newRequestId,
            nuevaSolicitudConsultorio: true,
            submittedAt: new Date().toISOString(),
            estadoAdmin: "PENDIENTE",
            estadoImporte: "PENDIENTE_VERIFICACION",
            estadoPago: "SIN_COMPROBANTE",
            periodoHabilitacion: "",
            mesesHabilitacion: "",
            importeEstimado: "0",
            importeConfirmado: "",
            validadoAdmin: false,
            validadoAt: undefined,
            mensajeAdmin: "",
            descripcionCertificado: "",
          },
        },
      ],
      // Mantener la alta principal para que el selector la considere como usada,
      // pero al guardar la nueva solicitud no sobrescribir ni borrar la principal.
      formularioHabilitacionConsultorio: target.formularioHabilitacionConsultorio || {},
    };
    setAltaSaveMode("create");
    setEditingConsultorio(next);
    setCreateAltaTargetId("");
    setShowCreateAltaModal(false);
    setCreateAltaSearch("");
    window.setTimeout(() => {
      const formHeader = document.querySelector<HTMLElement>(".cokifimi-consultorio-wizard-header");
      if (formHeader) {
        formHeader.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  };
  const decide = async (approved: boolean) => {
    if (!selected) return;
    const paymentStatus = String(selected.formularioHabilitacionConsultorio?.estadoPago || "");
    if (approved && paymentStatus !== "PAGO_VALIDADO") {
      window.alert("No se puede aprobar el alta hasta validar el comprobante de pago.");
      return;
    }
    if (!approved && !message.trim()) {
      window.alert("Ingrese un mensaje para informar el motivo del rechazo.");
      return;
    }
    if (approved && (!certificateFrom || !certificateTo)) {
      window.alert("Indique la fecha inicial y final de vigencia antes de aprobar.");
      return;
    }
    if (approved && certificateTo <= certificateFrom) {
      window.alert("La fecha final debe ser posterior a la fecha inicial.");
      return;
    }

    const resolvedId = selected.id;
    setResolutionAction(approved ? "approve" : "reject");
    const adminMessage = message.trim();
    const now = new Date().toISOString();

    const previousForm = (selected.formularioHabilitacionConsultorio || {}) as Record<string, unknown>;
    const previousHistory = Array.isArray(previousForm.historialSolicitud) ? previousForm.historialSolicitud : [];
    const previousMessage = String(previousForm.mensajeAdmin || previousForm.descripcionCertificado || "").trim();
    const preservedHistory = !approved && previousForm.estadoAdmin === "RECHAZADO" && previousMessage
      ? [...previousHistory, consultorioHistorySnapshot(previousForm)]
      : previousHistory;
    const historyToSave = !approved
      ? [...preservedHistory, consultorioHistorySnapshot({ ...previousForm, estadoAdmin: 'RECHAZADO', mensajeAdmin: adminMessage, descripcionCertificado: adminMessage, rechazadoAt: now })]
      : preservedHistory;
    const actionButton = document.querySelector<HTMLButtonElement>(
      `.cokifimi-consultorio-review-box.is-modal-open ${approved ? ".is-approve" : ".is-reject"}`,
    );
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.innerHTML = approved
        ? '<span class="cokifimi-payment-spinner" aria-hidden="true">⟳</span> Generando certificados...'
        : '<span class="cokifimi-payment-spinner" aria-hidden="true">⟳</span> Rechazando...';
    }

    try {
      const selectedForApproval = {
        ...selected,
        formularioHabilitacionConsultorio: {
          ...selected.formularioHabilitacionConsultorio,
          certificadoVigenciaDesde: certificateFrom,
          certificadoVigenciaHasta: certificateTo,
        },
      };
      const automatic = approved ? generateAutomaticCertificates(selectedForApproval) : null;
      const saved = (await onUpdate({
        ...selected,
        formularioHabilitacionConsultorio: {
          ...selected.formularioHabilitacionConsultorio,
          estadoAdmin: approved ? "APROBADO" : "RECHAZADO",
          validadoAdmin: approved,
          validadoAt: now,
          mensajeAdmin: adminMessage,
          descripcionCertificado: approved ? adminMessage : "",
          certificadoNombre: automatic?.consultorioNombre || "",
          certificadoUrl: automatic?.consultorioUrl || "",
          certificadoConsultorioNombre: automatic?.consultorioNombre || "",
          certificadoConsultorioUrl: automatic?.consultorioUrl || "",
          certificadoEticaNombre: automatic?.eticaNombre || "",
          certificadoEticaUrl: automatic?.eticaUrl || "",
          certificadoVigenciaDesde: automatic?.vigenciaDesde || "",
          certificadoVigenciaHasta: automatic?.vigenciaHasta || "",
                  historialSolicitud: historyToSave,
        },
      })) || selected;
      setSelected(keepSelectedRequest(saved, selected));

      if (isServerConfigured()) {
        void notifyConsultorioResolution(resolvedId, approved, adminMessage, selected.consultorioSolicitudId).catch((error) => {
          console.error("No se pudo enviar el aviso de resolución al colegiado:", error);
        });
      }
      if (actionButton) {
        actionButton.innerHTML = approved ? "✓ Enviado" : "✓ Solicitud rechazada";
        actionButton.classList.add("is-sent");
      }
      setResolutionResult({ id: resolvedId, approved });
      window.setTimeout(() => {
        setSelected(null);
      }, 1450);
      window.setTimeout(() => setResolutionResult(null), 3600);
    } catch (error) {
      setResolutionAction(null);
      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = approved
          ? "Aprobar y generar certificados"
          : "Rechazar solicitud";
      }
      window.alert(error instanceof Error ? error.message : "No se pudo finalizar la solicitud.");
    }
  };const updatedModal = showUpdatedModal ? (
        <div className="cokifimi-consultorio-updated-modal" role="status" aria-live="polite">
          <div className="cokifimi-consultorio-updated-dialog">
            <button type="button" className="cokifimi-consultorio-updated-close" onClick={() => setShowUpdatedModal(false)} aria-label="Cerrar aviso"><X /></button>
{updatedModalTitle === "ENVIANDO IMPORTE" || updatedModalTitle === "ENVIANDO COMPROBANTE" ? <LoaderCircle className="cokifimi-payment-spinner" /> : <CheckCircle2 />}
            <strong>{updatedModalTitle}</strong>
            <span>{updatedModalMessage}</span>
          </div>
        </div>
      ) : null;

  if (editingConsultorio)
    return (
      <section className="cokifimi-consultorio-requests is-editing-consultorio">
        <ConsultorioHabilitacionForm
          record={editingConsultorio}
          saving={savingConsultorio}
          adminEdit
          excludedConsultorioAddresses={
            [
              !editingConsultorio.consultorioSolicitudId ? undefined : editingConsultorio.formularioHabilitacionConsultorio,
              ...(editingConsultorio.consultorioSolicitudes || [])
                .filter((request) => request.id !== editingConsultorio.consultorioSolicitudId)
                .map((request) => request.formularioHabilitacionConsultorio),
            ]
              .filter(Boolean)
              .map((form) => `${form?.domicilioConsultorio || ""} ${form?.numeroConsultorio || ""} ${form?.localidadConsultorio || ""}`.trim())
              .filter(Boolean)
          }
          onCancel={() => setEditingConsultorio(null)}
          onReview={async (updated) => {
            const isCreate = altaSaveMode === "create";
            const requestId = isCreate ? (updated.consultorioSolicitudId || editingConsultorio?.consultorioSolicitudId || `alta_${Date.now()}`) : undefined;
            const baseRecord = declarations.find((item) => item.id === updated.id) || editingConsultorio || updated;
            const existingRequests = [...(baseRecord.consultorioSolicitudes || [])];
            if (isCreate && requestId) {
              const requestIndex = existingRequests.findIndex((request) => request.id === requestId);
              const requestData = { ...updated.formularioHabilitacionConsultorio, consultorioSolicitudId: requestId };
              const requestAddressKey = consultorioRequestAddressKey(requestData);
              const principalAddressKey = consultorioRequestAddressKey(baseRecord.formularioHabilitacionConsultorio);
              const duplicateAddress = requestAddressKey && (
                requestAddressKey === principalAddressKey ||
                existingRequests.some((request, index) => index !== requestIndex && consultorioRequestAddressKey(request.formularioHabilitacionConsultorio) === requestAddressKey)
              );
              if (duplicateAddress) {
                window.alert("Ese domicilio ya tiene un alta registrada. Seleccione otro domicilio.");
                return;
              }
              if (requestIndex >= 0) {
                existingRequests[requestIndex] = { ...existingRequests[requestIndex], id: requestId, formularioHabilitacionConsultorio: requestData };
              } else {
                existingRequests.push({ id: requestId, formularioHabilitacionConsultorio: requestData });
              }
            }
            const prepared = isCreate
              ? {
                  ...baseRecord,
                  ...updated,
                  id: updated.id,
                  consultorioSolicitudId: requestId,
                  formularioHabilitacionConsultorio: baseRecord.formularioHabilitacionConsultorio || updated.formularioHabilitacionConsultorio || {},
                  consultorioSolicitudes: existingRequests.filter((request, index, requests) => {
                    const addressKey = consultorioRequestAddressKey(request.formularioHabilitacionConsultorio);
                    return requests.findIndex((candidate) => candidate.id === request.id || (addressKey && consultorioRequestAddressKey(candidate.formularioHabilitacionConsultorio) === addressKey)) === index;
                  }),
                }
              : updated;
            const preparedForm = prepared.formularioHabilitacionConsultorio || {};
            const preparedHasIssuedCertificate = preparedForm.estadoAdmin === "APROBADO"
              || preparedForm.validadoAdmin === true;
            const preparedWithCertificates = prepared;            setSavingConsultorio(true);
            try {
            await onUpdate(preparedWithCertificates);
            setEditingConsultorio(null);
            setUpdatedConsultorioId(updated.id);
            setUpdatedModalTitle(isCreate ? "GUARDADO CORRECTAMENTE" : "ACTUALIZADO");
            setUpdatedModalMessage(isCreate ? "El alta de consultorio fue guardada correctamente." : "El alta de consultorio fue actualizada correctamente.");
            setShowUpdatedModal(true);
            window.setTimeout(() => focusUpdatedConsultorioCard(updated.id), 120);
            window.setTimeout(() => {
              setShowUpdatedModal(false);
              setUpdatedConsultorioId(null);
              setUpdatedModalTitle("ACTUALIZADO");
              setUpdatedModalMessage("El alta de consultorio fue actualizada correctamente.");
            }, 3600);
            } finally {
              setSavingConsultorio(false);
            }
          }}
        />
        {savingConsultorio && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-saving-consultorio-title">
            <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
              <LoaderCircle className="cokifimi-payment-spinner mx-auto h-12 w-12 text-emerald-700" />
              <h2 id="admin-saving-consultorio-title" className="mt-5 text-xl font-extrabold text-slate-900">Aguarde, guardando alta</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Estamos guardando la solicitud. No cierre esta ventana.</p>
            </div>
          </div>
        )}
      </section>
    );
  if (selected)
    return (
      <section className="cokifimi-consultorio-requests is-reviewing">
        <div className="cokifimi-consultorio-request-review-context">
          <span>REVISIÓN DE SOLICITUD · FORMULARIO 2</span>
          <strong>
            {selected.apellido}, {selected.nombres} <i>·</i> M.P.{" "}
            {selected.matricula}
          </strong>
        </div>
        <ConsultorioHabilitacionPreview
          data={selected}
          onCancel={() => { setResolutionAction(null); setResolutionOpen(false); setSelected(null); }}
          onOpenResolution={() => { setResolutionAction(null); setResolutionOpen(true); }}
          saving={false}
          isPendingSave={false}
          backLabel="Volver a solicitudes"
        />        {resolutionOpen && createPortal((<div className="cokifimi-consultorio-review-modal-layer"><aside className="cokifimi-consultorio-review-box is-modal-open">
          <div>
            <p>RESOLUCIÓN ADMINISTRATIVA</p>
            <h2>Aprobar o rechazar solicitud</h2>
            <span>El mensaje será visible para el colegiado en su panel.</span>
          </div>
          <label>Mensaje o descripción opcional
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ej.: Información adicional para el colegiado..."
            />
          </label>
          <p className="cokifimi-consultorio-automatic-certificate-note">
            <FileCheck /> Al aprobar se generan automáticamente el certificado
            de habilitación y el certificado de ética / libre deuda.
          </p>
          <div className="cokifimi-consultorio-review-actions">
            <button
              type="button"
              className="is-reject"
              onClick={() => decide(false)}
            >
              <FileX2 /> Rechazar solicitud
            </button>
            <button
              type="button"
              className="is-approve"
              onClick={() => decide(true)}
            >
              <FileCheck /> Aprobar y generar certificados
            </button>
          </div>
          {resolutionAction === "approve" && <small className="cokifimi-consultorio-wait-message">Puede demorar unos segundos. Aguarde por favor.</small>}
        </aside></div>), document.body)}
        {resolutionResult && (
          <div
            className={`cokifimi-consultorio-resolution-feedback is-${resolutionResult.approved ? "approved" : "rejected"}`}
          >
            <div>
              {resolutionResult.approved ? <CheckCircle2 /> : <FileX2 />}
            </div>
            <strong>
              {resolutionResult.approved
                ? "Solicitud aprobada"
                : "Solicitud rechazada"}
            </strong>
            <span>Redirigiendo a la tarjeta del colegiado…</span>
          </div>
        )}
        {historyItem && createPortal((() => {
        const current = historyItem.formularioHabilitacionConsultorio || {};
        const previous = Array.isArray(current.historialSolicitud) ? current.historialSolicitud : [];
        const entries = [...previous, current];
        const isResubmittedAfterRejection = Boolean(current.reenvioAt) || previous.some((entry) => String((entry as Record<string, unknown>)?.estadoAdmin || "") === "RECHAZADO");
        const label = (form: Record<string, unknown>) => form.estadoAdmin === "RECHAZADO" ? "Solicitud rechazada" : form.validadoAdmin === true || form.estadoAdmin === "APROBADO" ? "Solicitud aprobada" : form.estadoImporte === "IMPORTE_CONFIRMADO" ? "Esperando pago" : "Pendiente de revisión";
        const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("es-AR") : "Sin informar";
        return <div className="cokifimi-member-history-modal" role="dialog" aria-modal="true" aria-labelledby="admin-history-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setHistoryItem(null); }}><div className="cokifimi-member-history-card"><header><div className="cokifimi-member-history-heading"><History /><div><h2 id="admin-history-title">Historial de la solicitud</h2><p className="cokifimi-member-history-person"><UserRound /> {historyItem.apellido}, {historyItem.nombres}</p></div></div><button type="button" aria-label="Cerrar historial" onClick={() => setHistoryItem(null)}><X /></button></header><div className="cokifimi-member-history-meta"><div><BadgeCheck /><span>Matrícula</span><b>{historyItem.matricula || "Sin informar"}</b></div><div><MapPin /><span>Ciudad del consultorio</span><b>{String(current.localidadConsultorio || "Sin informar")}</b></div></div><div className="cokifimi-member-history-list">{isResubmittedAfterRejection && <div className="cokifimi-member-history-resubmission-banner"><strong>Solicitud reenviada por rechazo anterior</strong><span>El historial conserva el motivo informado en el rechazo previo.</span></div>}{entries.map((entry, index) => { const form = (entry || {}) as Record<string, unknown>; return <article key={`${String(form.submittedAt || index)}-${index}`} className={`cokifimi-member-history-item ${label(form) === "Solicitud rechazada" ? "is-rejected" : ""}`}><strong>{index === entries.length - 1 ? "Estado actual" : `Solicitud ${index + 1}`}</strong><div><CalendarDays /><span>Fecha solicitada</span><b>{date(form.submittedAt)}</b></div><div><CalendarDays /><span>Fecha inicio</span><b>{date(form.certificadoVigenciaDesde)}</b></div><div><CalendarDays /><span>Fecha fin</span><b>{date(form.certificadoVigenciaHasta)}</b></div><div><CircleDollarSign /><span>Monto</span><b>{form.importeConfirmado ? `$ ${Number(form.importeConfirmado).toLocaleString("es-AR")}` : "Sin informar"}</b></div><div><Activity /><span>Estado</span><b>{label(form)}</b></div><div className="cokifimi-member-history-resolution"><Clock3 /><span>{label(form) === "Solicitud aprobada" ? "Fecha y hora de aprobación" : label(form) === "Solicitud rechazada" ? "Fecha y hora de rechazo" : "Fecha y hora de actualización"}</span><b>{form.validadoAt || form.rechazadoAt || form.resueltoAt ? new Date(String(form.validadoAt || form.rechazadoAt || form.resueltoAt)).toLocaleString("es-AR") : "Sin informar"}</b></div><div className="cokifimi-member-history-message"><MessageSquareText /><span>Mensaje</span><b>{String(form.mensajeAdmin || form.descripcionCertificado || "Sin mensaje informado")}</b></div></article>; })}</div></div></div>;
      })(), document.body)}      {updatedModal}
      </section>
    );
  return (
    <section className="cokifimi-consultorio-requests">
      <header className="cokifimi-consultorio-panel-header">
        <div>
          <p>SOLICITUDES · FORMULARIO 2</p>
          <h1>Altas y actualizaciones de consultorio</h1>
          <span>Revise cada solicitud completa y resuelva su aprobación.</span>
        </div>
        <div className="cokifimi-consultorio-panel-header-actions">
          <button type="button" onClick={onClose}>
            <X /> Cerrar
          </button>
        </div>
      </header>
      <div className="cokifimi-consultorio-toolbar">
        <div className="cokifimi-consultorio-requests-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar colegiado, matrícula o DNI"
          />
        </div>
        <button type="button" className="cokifimi-consultorio-create-alt-button is-primary" onClick={() => setShowCreateAltaModal(true)}>
          <FileCheck /> Crear alta
        </button>
      </div>
      <div ref={requestsListRef} className="cokifimi-consultorio-requests-list">
        {requests.map((item) => {
          const form = item.formularioHabilitacionConsultorio || {};
          const rejected = form.estadoAdmin === "RECHAZADO";
          const approved =
            !rejected && (form.estadoAdmin === "APROBADO" || form.validadoAdmin === true);
          const awaitingPayment =
            form.estadoImporte === "IMPORTE_CONFIRMADO" &&
            !["COMPROBANTE_RECIBIDO", "PAGO_VALIDADO"].includes(
              String(form.estadoPago || ""),
            );
          const status = approved
            ? "Aprobada"
            : rejected
              ? "Rechazada"
              : "Pendiente de aprobación";
          const displayStatus = rejected
            ? "Solicitud rechazada"
            : form.estadoPago === "COMPROBANTE_RECIBIDO"
              ? "Pendiente de aprobar pago y dar el alta"
              : awaitingPayment
                ? "Esperando comprobante de pago"
                : status;
          const rejectionMessage = String(
            form.mensajeAdmin || form.descripcionCertificado || "",
          ).trim();
          const hasPreviousRejection = (Boolean(form.reenvioAt) || (Array.isArray(form.historialSolicitud) && form.historialSolicitud.some((entry) => String((entry as Record<string, unknown>)?.estadoAdmin || "") === "RECHAZADO")));
          const attachedProfessionals = Array.from({ length: 8 }, (_, index) => index + 1).map((ordinal) => {
            const suffix = ordinal > 1 ? String(ordinal) : "";
            const matricula = form[`adjuntoMatricula${suffix}`];
            if (!matricula) return null;
            // Un colegiado no puede figurar como su propio profesional adjunto.
            if (normalizedMatricula(matricula) === normalizedMatricula(item.matricula)) return null;
            const linked = findProfessionalByMatricula(matricula, declarations, item.id);
            const linkedForm = linked?.formularioHabilitacionConsultorio || {};
            return {
              ordinal,
              apellido: String(form[`adjuntoApellido${suffix}`] || linked?.apellido || ""),
              nombres: String(form[`adjuntoNombres${suffix}`] || linked?.nombres || ""),
              matricula: String(matricula),
              dni: String(form[`adjuntoDni${suffix}`] || linked?.dni || ""),
              titulo: String(form[`adjuntoTitulo${suffix}`] || linked?.tituloUniversitario || ""),
              recordId: linked?.id || "",
              fotoUrl: linked?.fotoUrl || (linked?.id ? localStorage.getItem(`cokifimi_declaration_photo_${linked.id}`) || "" : ""),
              certificadoAnssalArchivo: String(linked?.certificadoAnssalArchivo || form[`certificadoAnssalArchivoAdjunto${suffix}`] || ""),
              certificadoAnssalArchivoNombre: String(linked?.certificadoAnssalArchivoNombre || form[`certificadoAnssalArchivoAdjunto${suffix}Nombre`] || "certificado-anssal.pdf"),
              polizaPraxisArchivo: String(linked?.polizaPraxisArchivo || form[`polizaPraxisArchivoAdjunto${suffix}`] || ""),
              polizaPraxisArchivoNombre: String(linked?.polizaPraxisArchivoNombre || form[`polizaPraxisArchivoAdjunto${suffix}Nombre`] || "poliza-praxis.pdf"),
            };
          }).filter((professional): professional is NonNullable<typeof professional> => Boolean(professional?.apellido || professional?.nombres || professional?.matricula));          const resolvedClass =
            resolutionResult?.id === item.id
              ? ` cokifimi-consultorio-request-card-resolved is-${resolutionResult.approved ? "approved" : "rejected"}`
              : "";
          return (
            <article
              key={`${item.id}-${item.consultorioSolicitudId || "principal"}`}
              data-consultorio-request-id={`${item.id}-${item.consultorioSolicitudId || "principal"}`}
              className={`cokifimi-consultorio-request-card${resolvedClass}${updatedConsultorioId === item.id ? " is-updated" : ""}`}
            >
              <div className="cokifimi-consultorio-request-card-head">
                <div>
                  <strong>
                    {item.apellido}, {item.nombres}
                  </strong>
                  <span>
                    M.P. {item.matricula} · DNI {item.dni}
                  </span>
                </div>
                <div className="cokifimi-consultorio-request-photo">
                  <RecordPhoto recordId={item.id} name={`${item.nombres} ${item.apellido}`} />
                </div>
              </div>
              <div className="cokifimi-consultorio-request-card-body">
                <div>
                  <small>Solicitud presentada</small>
                  <b>
                    {form.submittedAt
                      ? new Date(String(form.submittedAt)).toLocaleDateString(
                          "es-AR",
                        )
                      : "—"}
                  </b>
                </div>
                <div>
                  <small>Tipo de trámite</small>
                  <b>
                    {form.renovacionHabilitacion === "SI"
                      ? "Renovación"
                      : "Nueva habilitación"}
                  </b>
                </div>
                <div>
                  <small>Área kinésica</small>
                  <b>{String(form.tipoArea || "Sin especificar")}</b>
                </div>
                <div>
                  <small>Localidad del consultorio</small>
                  <b>
                    {String(form.localidadConsultorio || "Sin especificar")}
                  </b>
                </div>
                {rejected && rejectionMessage && (
                  <div className="cokifimi-consultorio-rejection-reason">
                    <small>Motivo del rechazo</small>
                    <b>{rejectionMessage}</b>
                  </div>
                )}
                {hasPreviousRejection && !rejected && (
                  <div className="cokifimi-consultorio-rejection-history-label">
                    <small><FileX2 /> Tipo de solicitud</small>
                    <b>Reenviada por rechazo</b>
                  </div>
                )}
                {attachedProfessionals.length > 0 && (
                  <div className="cokifimi-attached-professionals">
                    <small>Profesionales adjuntos asociados</small>
                    <div className={`cokifimi-attached-professionals-list ${attachedProfessionals.length === 1 ? "is-single" : ""}`}>
                      {attachedProfessionals.map((professional) => (
                        <div key={professional.ordinal} className="cokifimi-attached-professional">
                          <div className="cokifimi-attached-professional-photo">
                            {professional.recordId ? <RecordPhoto recordId={professional.recordId} name={`${professional.nombres} ${professional.apellido}`} /> : professional.fotoUrl ? <img src={professional.fotoUrl} alt={`Foto de ${professional.nombres} ${professional.apellido}`} /> : <FileCheck />}
                          </div>
                          <div>
                            <strong>{professional.apellido}, {professional.nombres}</strong>
                            <span>M.P. {professional.matricula}{professional.dni ? ` · DNI ${professional.dni}` : ''}</span>
                            {professional.titulo && <em>{professional.titulo}</em>}                            {(professional.certificadoAnssalArchivo || professional.polizaPraxisArchivo) && (
                              <div className="cokifimi-attached-professional-downloads">
                                {professional.certificadoAnssalArchivo && <button type="button" onClick={() => downloadAdminAttachment(professional.certificadoAnssalArchivo, professional.certificadoAnssalArchivoNombre)}><Download /> Certificado ANSSAL</button>}
                                {professional.polizaPraxisArchivo && <button type="button" onClick={() => downloadAdminAttachment(professional.polizaPraxisArchivo, professional.polizaPraxisArchivoNombre)}><Download /> Póliza de praxis</button>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <RequestVerificationSteps form={form} approved={approved} rejected={rejected} />
                <div className="cokifimi-request-bottom-summary">
                  <div className="cokifimi-request-status-cell">
                    <small>Estado de la solicitud</small>
                    <em className={approved ? "is-approved" : rejected ? "is-rejected" : ""}>
                      {displayStatus}
                    </em>
                  </div>
                  <RequestValidity form={form} approved={approved} />
                </div>
                <div className="cokifimi-request-history-slot">
                <button type="button" className="is-history" onClick={() => setHistoryItem(item)}><History /> Historial</button>
                </div>
              </div>
              <div className="cokifimi-consultorio-request-actions">
                <button
                  type="button"
                  disabled={openingRequestId === `${item.id}:${item.consultorioSolicitudId || "principal"}`}
                  onClick={() => void choose(item)}
                >
                  {openingRequestId === `${item.id}:${item.consultorioSolicitudId || "principal"}` ? (
                    <><LoaderCircle className="animate-spin" /> Cargando resolución...</>
                  ) : (
                    <><Eye /> Vista previa y resolución</>
                  )}
                </button>

                <button type="button" className="is-edit" onClick={() => requestEdit(item)}>
                  <Pencil /> Editar alta
                </button>
                <button type="button" className="is-delete" onClick={() => requestDelete(item)}>
                  <Trash2 /> Eliminar
                </button>
              </div>
            </article>
          );
        })}
        {!requests.length && (
          <p className="cokifimi-consultorio-requests-empty">
            No hay solicitudes de Formulario 2 para mostrar.
          </p>
        )}
      </div>
      {historyItem && createPortal((() => {
        const current = historyItem.formularioHabilitacionConsultorio || {};
        const previous = Array.isArray(current.historialSolicitud) ? current.historialSolicitud : [];
        const entries = [...previous, current];
        const isResubmittedAfterRejection = Boolean(current.reenvioAt) || previous.some((entry) => String((entry as Record<string, unknown>)?.estadoAdmin || "") === "RECHAZADO");
        const label = (form: Record<string, unknown>) => form.estadoAdmin === "RECHAZADO" ? "Solicitud rechazada" : form.validadoAdmin === true || form.estadoAdmin === "APROBADO" ? "Solicitud aprobada" : form.estadoImporte === "IMPORTE_CONFIRMADO" ? "Esperando pago" : "Pendiente de revisión";
        const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("es-AR") : "Sin informar";
        return <div className="cokifimi-member-history-modal" role="dialog" aria-modal="true" aria-labelledby="admin-history-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setHistoryItem(null); }}><div className="cokifimi-member-history-card"><header><div className="cokifimi-member-history-heading"><History /><div><h2 id="admin-history-title">Historial de la solicitud</h2><p className="cokifimi-member-history-person"><UserRound /> {historyItem.apellido}, {historyItem.nombres}</p></div></div><button type="button" aria-label="Cerrar historial" onClick={() => setHistoryItem(null)}><X /></button></header><div className="cokifimi-member-history-meta"><div><BadgeCheck /><span>Matrícula</span><b>{historyItem.matricula || "Sin informar"}</b></div><div><MapPin /><span>Ciudad del consultorio</span><b>{String(current.localidadConsultorio || "Sin informar")}</b></div></div><div className="cokifimi-member-history-list">{isResubmittedAfterRejection && <div className="cokifimi-member-history-resubmission-banner"><strong>Solicitud reenviada por rechazo anterior</strong><span>El historial conserva el motivo informado en el rechazo previo.</span></div>}{entries.map((entry, index) => { const form = (entry || {}) as Record<string, unknown>; return <article key={`${String(form.submittedAt || index)}-${index}`} className={`cokifimi-member-history-item ${label(form) === "Solicitud rechazada" ? "is-rejected" : ""}`}><strong>{index === entries.length - 1 ? "Estado actual" : `Solicitud ${index + 1}`}</strong><div><CalendarDays /><span>Fecha solicitada</span><b>{date(form.submittedAt)}</b></div><div><CalendarDays /><span>Fecha inicio</span><b>{date(form.certificadoVigenciaDesde)}</b></div><div><CalendarDays /><span>Fecha fin</span><b>{date(form.certificadoVigenciaHasta)}</b></div><div><CircleDollarSign /><span>Monto</span><b>{form.importeConfirmado ? `$ ${Number(form.importeConfirmado).toLocaleString("es-AR")}` : "Sin informar"}</b></div><div><Activity /><span>Estado</span><b>{label(form)}</b></div><div className="cokifimi-member-history-resolution"><Clock3 /><span>{label(form) === "Solicitud aprobada" ? "Fecha y hora de aprobación" : label(form) === "Solicitud rechazada" ? "Fecha y hora de rechazo" : "Fecha y hora de actualización"}</span><b>{form.validadoAt || form.rechazadoAt || form.resueltoAt ? new Date(String(form.validadoAt || form.rechazadoAt || form.resueltoAt)).toLocaleString("es-AR") : "Sin informar"}</b></div><div className="cokifimi-member-history-message"><MessageSquareText /><span>Mensaje</span><b>{String(form.mensajeAdmin || form.descripcionCertificado || "Sin mensaje informado")}</b></div></article>; })}</div></div></div>;
      })(), document.body)}      {updatedModal}
      {showCreateAltaModal && (
        <div className="cokifimi-consultorio-delete-modal" role="dialog" aria-modal="true" aria-labelledby="create-consultorio-title">
          <div className="cokifimi-consultorio-delete-dialog cokifimi-consultorio-create-alta-dialog">
            <button type="button" className="cokifimi-consultorio-delete-close" onClick={() => { setShowCreateAltaModal(false); setCreateAltaTargetId(""); setCreateAltaSearch(""); }} aria-label="Cerrar"><X /></button>
            <div className="cokifimi-consultorio-delete-icon"><FileCheck /></div>
            <p>Alta manual</p>
            <h2 id="create-consultorio-title">Crear alta para colegiado vigente</h2>
            <span>Busque por nombre, matrícula o DNI y seleccione al colegiado para abrir el alta desde administración.</span>
            <label className="cokifimi-consultorio-create-alta-search-label">Buscar colegiado
              <input
                type="text"
                value={createAltaSearch}
                onChange={(event) => setCreateAltaSearch(event.target.value)}
                placeholder="Apellido, nombre, DNI o matrícula"
              />
            </label>
            <div className="cokifimi-consultorio-create-alta-list">
              {filteredCreateAltaCandidates.length ? filteredCreateAltaCandidates.map((item) => {
                const active = hasActiveAlta(item);
                const eligible = canCreateAlta(item);
                const totalAltasRealizadas = Number(Boolean(item.formularioHabilitacionConsultorio?.submittedAt)) + (item.consultorioSolicitudes?.length || 0);
                const reasonLabel = totalAltasRealizadas >= 3
                  ? "Máximo 3 altas alcanzado"
                  : !hasFreeConsultorioAddress(item)
                    ? "Sin domicilio libre disponible"
                    : "";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`cokifimi-consultorio-create-alta-option ${createAltaTargetId === item.id ? "is-selected" : ""}`}
                    onClick={() => {
                      if (!eligible) return;
                      setCreateAltaTargetId(item.id);
                    }}
                    disabled={!eligible}
                  >
                    <span className="cokifimi-consultorio-create-alta-row-title">
                      <span className="cokifimi-consultorio-create-alta-name">{item.apellido}, {item.nombres}</span>
                      {active && <span className="cokifimi-consultorio-create-alta-badge">Alta vigente</span>}
                      {!eligible && !active && reasonLabel && <span className="cokifimi-consultorio-create-alta-badge is-neutral">{reasonLabel}</span>}
                    </span>
                    <span className="cokifimi-consultorio-create-alta-meta">DNI {item.dni} · M.P. {item.matricula}</span>
                  </button>
                );
              }) : <p className="cokifimi-consultorio-create-alta-empty">No hay colegiados con declaración bianual vigente.</p>}
            </div>
            <div className="cokifimi-consultorio-delete-actions">
              <button type="button" onClick={() => { setShowCreateAltaModal(false); setCreateAltaTargetId(""); setCreateAltaSearch(""); }}>Cancelar</button>
              <button
                type="button"
                className={`is-primary${createAltaTargetId && canCreateAlta(declarations.find((item) => item.id === createAltaTargetId) || ({ } as DeclarationData)) ? " is-enabled" : ""}`}
                disabled={!createAltaTargetId || !canCreateAlta(declarations.find((item) => item.id === createAltaTargetId) || ({ } as DeclarationData))}
                onClick={createAltaForMember}
              >
                Crear alta
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteSuccessModal && (
        <div className="cokifimi-consultorio-updated-modal" role="status" aria-live="polite">
          <div className="cokifimi-consultorio-updated-dialog">
            <CheckCircle2 />
            <strong>ELIMINADO</strong>
            <span>El alta de consultorio fue eliminada correctamente.</span>
          </div>
        </div>
      )}
      {resolutionResult && (
        <div
          className={`cokifimi-consultorio-resolution-feedback is-${resolutionResult.approved ? "approved" : "rejected"}`}
          role="status"
          aria-live="polite"
        >
          <div>
            {resolutionResult.approved ? <CheckCircle2 /> : <FileX2 />}
          </div>
          <strong>
            {resolutionResult.approved ? "Solicitud aprobada" : "Solicitud rechazada"}
          </strong>
          <span>Redirigiendo a la tarjeta del colegiado…</span>
        </div>
      )}
      {deleteCandidate && (
        <div className="cokifimi-consultorio-delete-modal" role="dialog" aria-modal="true" aria-labelledby="consultorio-delete-title">
          <div className="cokifimi-consultorio-delete-dialog">
            <button type="button" className="cokifimi-consultorio-delete-close" onClick={() => setDeleteCandidate(null)} aria-label="Cerrar"><X /></button>
            <div className="cokifimi-consultorio-delete-icon"><Trash2 /></div>
            <p>Acci&oacute;n permanente</p>
            <h2 id="consultorio-delete-title">&iquest;Eliminar esta solicitud?</h2>
            <span>Se eliminar&aacute;n el alta, sus datos y los adjuntos guardados. Esta acci&oacute;n no se puede deshacer.</span>
            <strong>{deleteCandidate.apellido}, {deleteCandidate.nombres}</strong>
            <label>Escriba <b>ELIMINAR</b> para confirmar
              <input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="ELIMINAR" />
            </label>
            <div className="cokifimi-consultorio-delete-actions">
              <button type="button" onClick={() => setDeleteCandidate(null)}>Cancelar</button>
              <button type="button" className="is-danger" disabled={deleteConfirmation.trim().toUpperCase() !== "ELIMINAR"} onClick={confirmDelete}>Eliminar solicitud</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
