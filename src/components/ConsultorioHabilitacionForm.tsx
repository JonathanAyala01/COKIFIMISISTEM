import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Download,
  Edit,
  Eye,
  Save,
  Send,
  UserRound,
  XCircle,
} from "lucide-react";
import { DeclarationData } from "../types";
import { MISIONES_LOCALITY_OPTIONS, MISIONES_LOCALITY_POSTAL_BY_NAME, normalizeMisionesLocality } from "../data/misionesLocalities";
import { KINESIOLOGY_TITLES } from "../constants/titles";
import { lookupServerRecord } from "../api";
import { generateAutomaticCertificates } from "../utils/certificates";
// @ts-ignore
import cokifimiLogo from "@/logo.png";

export type ConsultorioFormValues = Record<
  string,
  string | boolean | undefined
>;
const today = () => {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
};
// Sede del Colegio: la declaración del adjunto se suscribe siempre en Posadas.
const CIUDAD_DECLARACION = "Posadas";
const yesNo = ["SI", "NO"];
// KINESIOLOGY_TITLES imported from src/constants/titles
// Por ahora las altas están habilitadas únicamente para consultorios particulares.
const CONSULTORIO_AREA_OPTIONS = [
  "Consultorio particular (un titular)",
  ...Array.from({ length: 8 }, (_, index) => {
    const count = index + 1;
    return `Consultorio particular (un titular y ${count === 1 ? "un" : count} adjunto${count === 1 ? "" : "s"})`;
  }),
  // 'Centro de día',
  // 'Instituto de rehabilitación',
  // 'Centro dependiente de obra social / servicio de salud / clínica / sanatorio',
  // 'Centro dependiente del Estado / universidad / club',
];
// Etiquetas explícitas donde el nombre derivado de la clave no alcanza.
const getAdjuntoCount = (area: string) => {
  const match = String(area || "").match(/\b(un|dos|[1-8])\s+adjuntos?\b/i);
  if (!match) return 0;
  const value = match[1].toLowerCase();
  return value === "un" ? 1 : value === "dos" ? 2 : Number(value);
};
const CONSULTORIO_FIELD_LABELS: Record<string, string> = {
  banoAdaptado: "Adaptado para discapacidad",
  aireEspera: "Aire acondicionado",
  ducha: "Ducha",
  instalacionElectrica: "Sistema monofásico (conexión eléctrica)",
  sistemaMonofasico: "Sistema monofásico (conexión eléctrica)",
  sistemaTrifasico: "Sistema trifásico (conexión eléctrica)",
  ventilacionForzadaConsultorio:
    "Ventilación forzada (ventilador de pie - ventilador de techo)",
  ventilacionForzadaEspera:
    "Ventilación forzada (ventilador de pie - ventilador de techo)",
  ventilacionPasivaConsultorio: "Ventilación pasiva (ventanas)",
  ventilacionPasivaEspera: "Ventilación pasiva (ventanas)",
};
const CONSULTORIO_LOCALITIES = MISIONES_LOCALITY_POSTAL_BY_NAME;

export default function ConsultorioHabilitacionForm({
  record,
  onReview,
  onCancel,
  saving,
  adminEdit = false,
  forceNewConsultorio = false,
  excludedConsultorioAddresses = [],
}: {
  record: DeclarationData;
  onReview: (data: DeclarationData) => void;
  onCancel: () => void;
  saving: boolean;
  adminEdit?: boolean;
  forceNewConsultorio?: boolean;
  excludedConsultorioAddresses?: string[];
}) {
  const isNewConsultorioDraft = forceNewConsultorio && record.formularioHabilitacionConsultorio?.nuevaSolicitudConsultorio === true;
  const currentRequest = !forceNewConsultorio && record.consultorioSolicitudId
    ? (record.consultorioSolicitudes || []).find((request) => request.id === record.consultorioSolicitudId)
    : undefined;
  const previous: ConsultorioFormValues = (forceNewConsultorio && !isNewConsultorioDraft ? {}
    : currentRequest?.formularioHabilitacionConsultorio
      || record.formularioHabilitacionConsultorio
      || {}) as ConsultorioFormValues;
  const allConsultorios = record.consultorios || [];
  const isTitularConsultorio = (consultorio: NonNullable<DeclarationData["consultorios"]>[number]) =>
    String(consultorio.esTitularConsultorio || "").trim().toUpperCase() === "SI";
  const isAdjuntoConsultorio = (consultorio: NonNullable<DeclarationData["consultorios"]>[number]) =>
    String(consultorio.esTitularConsultorio || "").trim().toUpperCase() === "NO" &&
    String(consultorio.esProfesionalAdjunto || "").trim().toUpperCase() === "SI";
  const normalizeConsultorioAddress = (value: unknown) => {
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
  const consultorioAddressKey = (...parts: unknown[]) =>
    normalizeConsultorioAddress(parts.filter(Boolean).join(" "));
  const extractAddressFromForm = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return { domicilio: "", numero: "", localidad: "", raw: "" };
    }
    const form = value as Record<string, unknown>;
    const domicilio = String(form.domicilioConsultorio ?? form.domicilio ?? "");
    const numero = String(form.numeroConsultorio ?? form.numeracion ?? "");
    const localidad = normalizeMisionesLocality(form.localidadConsultorio ?? form.ciudad ?? "");
    return {
      domicilio,
      numero,
      localidad,
      raw: domicilio || numero || localidad ? `${domicilio} ${numero} ${localidad}`.trim() : "",
    };
  };
  const editingPrimaryRequest = !forceNewConsultorio && !record.consultorioSolicitudId && Boolean(record.formularioHabilitacionConsultorio?.submittedAt);
  const usedConsultorioAddressKeys = new Set<string>();
  const addressCandidates = [
    (editingPrimaryRequest || currentRequest || isNewConsultorioDraft || (adminEdit && previous.domicilioConsultorio)) ? undefined : record.formularioHabilitacionConsultorio,
    ...(record.consultorioSolicitudes || [])
      .filter((request) => request.id !== record.consultorioSolicitudId)
      .map((request) => request.formularioHabilitacionConsultorio),
    ...excludedConsultorioAddresses.map((address) => ({ domicilioConsultorio: address })),
  ];
  for (const candidate of addressCandidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const form = candidate as Record<string, unknown>;
    const { domicilio, numero, localidad, raw } = extractAddressFromForm(form);
    const key = consultorioAddressKey(domicilio, numero, localidad);
    const rawKey = raw ? normalizeConsultorioAddress(raw) : "";
    if (key) usedConsultorioAddressKeys.add(key);
    if (rawKey) usedConsultorioAddressKeys.add(rawKey);
  }
  const isConsultorioUsed = (consultorio: NonNullable<DeclarationData["consultorios"]>[number]) =>
    usedConsultorioAddressKeys.has(
      consultorioAddressKey(consultorio.domicilio, consultorio.numeracion, consultorio.ciudad),
    );
  const inheritedDocument = (key: string): string => {
    const visited = new Set<object>();
    const find = (value: unknown): string => {
      if (!value || typeof value !== 'object' || visited.has(value as object)) return '';
      visited.add(value as object);
      if (Array.isArray(value)) {
        for (const item of value) { const found = find(item); if (found) return found; }
        return '';
      }
      const source = value as Record<string, unknown>;
      for (const candidate of [key, `${key}Url`, `${key}Base64`]) {
        const item = source[candidate];
        if (typeof item === 'string' && item.trim()) return item.trim();
        if (typeof item === 'number' && item > 0) return String(item);
        if (item && typeof item === 'object') {
          for (const nested of ['url', 'downloadUrl', 'src', 'file', 'data', 'base64']) {
            const file = (item as Record<string, unknown>)[nested];
            if (typeof file === 'string' && /^(data:|https?:\/\/|blob:)/i.test(file.trim())) return file.trim();
          }
        }
      }
      for (const child of Object.values(source)) { const found = find(child); if (found) return found; }
      return '';
    };
    const fromRecord = find(record);
    if (fromRecord) return fromRecord;
    try {
      const stored = JSON.parse(localStorage.getItem("cokifimi_consultorio_adjuntos_" + record.id) || '{}');
      return find(stored);
    } catch {
      return '';
    }
  };
  const preserveCurrentConsultorio = Boolean(currentRequest) || previous.estadoAdmin === "RECHAZADO" || Boolean(adminEdit && previous.domicilioConsultorio);
  const currentAltaAddressKey = preserveCurrentConsultorio
    ? consultorioAddressKey(previous.domicilioConsultorio, previous.numeroConsultorio, previous.localidadConsultorio)
    : '';
  const currentAltaMatchesBianual = allConsultorios.some((consultorio) =>
    consultorioAddressKey(consultorio.domicilio, consultorio.numeracion, consultorio.ciudad) === currentAltaAddressKey,
  );
  // Si el domicilio del alta ya no está en la bianual vigente, se conserva como
  // opción editable para no perderlo ni obligar al administrador a cargarlo a mano.
  const currentAltaFallback = preserveCurrentConsultorio && currentAltaAddressKey && !currentAltaMatchesBianual
    ? [{
        domicilio: String(previous.domicilioConsultorio || ''),
        numeracion: String(previous.numeroConsultorio || ''),
        ciudad: normalizeMisionesLocality(previous.localidadConsultorio || ''),
        esTitularConsultorio: 'SI' as const,
        esProfesionalAdjunto: 'NO' as const,
        fechaInicioConsultorio: String(previous.fechaInicioActividad || ''),
      }]
    : [];
  const consultoriosDisponibles = [...allConsultorios, ...currentAltaFallback];
  const firstAvailableConsultorio = consultoriosDisponibles.find((consultorio) => !isConsultorioUsed(consultorio) && isTitularConsultorio(consultorio));
  const first = firstAvailableConsultorio || consultoriosDisponibles[0];
  const previousConsultorioIndex = consultoriosDisponibles.findIndex((consultorio) =>
    consultorioAddressKey(consultorio.domicilio, consultorio.numeracion, consultorio.ciudad) === currentAltaAddressKey,
  );
  const initialConsultorioIndex = preserveCurrentConsultorio && previousConsultorioIndex >= 0 ? previousConsultorioIndex : -1;
  // En el Alta se respeta exclusivamente lo declarado en el Formulario 1.
  // Sin consultorio, la condición de obras sociales queda fijada en NO.
  const bianualAtiendeObrasSociales =
    record.trabajaConsultorio === "SI" ? record.atiendeObrasSociales || "NO" : "NO";
  const bianualAsociado = record.asociadoAsociacion || "NO";
  const [step, setStep] = useState(1);
  const formRef = useRef<HTMLFormElement>(null);
  const [previewData, setPreviewData] = useState<DeclarationData | null>(null);
  const [lookupLoadingByOrdinal, setLookupLoadingByOrdinal] = useState<Record<number, boolean>>({});
  const [lookupCompletedByOrdinal, setLookupCompletedByOrdinal] = useState<Record<number, boolean>>({});
  const [selectedConsultorioIndex, setSelectedConsultorioIndex] = useState(initialConsultorioIndex);
  const missingByStep = useRef<Record<number, string[]>>({});
  const [data, setData] = useState<ConsultorioFormValues>(() => ({
    fecha: today(),
    tipoPresentacion: "TITULAR",
    domicilioConsultorio: previous.domicilioConsultorio || "",
    numeroConsultorio: previous.numeroConsultorio || "",
    localidadConsultorio: normalizeMisionesLocality(previous.localidadConsultorio || ""),
    codigoPostalConsultorio: previous.codigoPostalConsultorio || record.codigoPostal || "",
    telefonoConsultorio: previous.telefonoConsultorio || record.telefono || "",
    celularConsultorio: previous.celularConsultorio || record.celular || "",
    mailConsultorio: previous.mailConsultorio || record.email || "",
    nombreTitular: `${record.apellido}, ${record.nombres}`,
    matriculaTitular: record.matricula,
    // Al crear un alta desde una bianual vigente, reutilizar también los
    // datos profesionales que el colegiado ya informó en el Formulario 1.
    fechaInicioActividad: previous.fechaInicioActividad || record.fechaInicioConsultorio || "",
    ...previous,
    // Estos valores siempre provienen del Formulario 1 bianual y no se editan en el Alta.
    atiendeObrasSociales: bianualAtiendeObrasSociales,
    poseeAnssal: record.poseeAnssal || previous.poseeAnssal || "",
    asociadoAsociacion: bianualAsociado,
    anssalDesde: record.anssalDesde || previous.anssalDesde || "",
    anssalHasta: record.anssalHasta || previous.anssalHasta || "",
    companiaSeguro: record.companiaSeguro || previous.companiaSeguro || "",
    polizaSeguro: record.polizaSeguro || previous.polizaSeguro || "",
    seguroDesde: record.seguroDesde || previous.seguroDesde || "",
    seguroHasta: record.seguroHasta || previous.seguroHasta || "",
    certificadoAnssalArchivo: record.certificadoAnssalArchivo || previous.certificadoAnssalArchivo || "",
    certificadoAnssalArchivoNombre: record.certificadoAnssalArchivoNombre || previous.certificadoAnssalArchivoNombre || "",
    polizaPraxisArchivo: record.polizaPraxisArchivo || previous.polizaPraxisArchivo || "",
    polizaPraxisArchivoNombre: record.polizaPraxisArchivoNombre || previous.polizaPraxisArchivoNombre || "",
    planoMunicipalArchivo: String(previous.planoMunicipalArchivo || ""),
    planoMunicipalArchivoNombre: String(previous.planoMunicipalArchivoNombre || ""),
    certificadoBomberosArchivo: inheritedDocument("certificadoBomberosArchivo"),
    certificadoBomberosArchivoNombre: String(previous.certificadoBomberosArchivoNombre || (record as DeclarationData & Record<string, unknown>).certificadoBomberosArchivoNombre || ""),
    declaraVeracidad: adminEdit ? false : Boolean(previous.declaraVeracidad),
    ciudadDeclaracion: record.municipioLocalidad || "",
    // Una nueva alta siempre obliga a elegir el domicilio; no reutiliza el de otra alta.
    ...(preserveCurrentConsultorio ? {} : {
      domicilioConsultorio: "",
      numeroConsultorio: "",
      localidadConsultorio: "",
    }),
  }));
  const [adjuntoSearchByOrdinal, setAdjuntoSearchByOrdinal] = useState<Record<number, string>>((): Record<number, string> => (adminEdit ? { 1: "", 2: "" } : {}));
  useEffect(() => {
    document
      .querySelectorAll<HTMLLabelElement>(".cokifimi-consultorio-form label")
      .forEach((label) => {
        if (label.firstChild?.textContent?.trim() === "bano")
          label.firstChild.textContent = "Baño";
      });
    const renewalSelect = Array.from(
      document.querySelectorAll<HTMLSelectElement>(
        ".cokifimi-consultorio-form select",
      ),
    ).find((select) =>
      /renovaci[oó]n/i.test(select.parentElement?.textContent || ""),
    );
    const noOption =
      renewalSelect?.querySelector<HTMLOptionElement>('option[value="NO"]');
    if (noOption) noOption.textContent = "No (habilitación de consultorio)";
    const periodSelect = Array.from(
      document.querySelectorAll<HTMLSelectElement>(
        ".cokifimi-consultorio-form select",
      ),
    ).find((select) => select.querySelector('option[value="12_MESES"]'));
    if (
      periodSelect &&
      !periodSelect.querySelector('option[value="6_MESES"]')
    ) {
      const minimumPeriod = document.createElement("option");
      minimumPeriod.value = "6_MESES";
      minimumPeriod.textContent = "6 meses / mínimo";
      periodSelect.insertBefore(minimumPeriod, periodSelect.options[1] || null);
    }
    const renewalFieldSelect = document.querySelector<HTMLSelectElement>(
      ".cokifimi-consultorio-form > section:first-of-type .cokifimi-consultorio-grid > label:nth-child(9) select",
    );
    if (renewalSelect) renewalSelect.disabled = step > 1;
    if (renewalFieldSelect) renewalFieldSelect.disabled = step > 1;
    document
      .querySelectorAll<HTMLSelectElement>(
        ".cokifimi-consultorio-form .cokifimi-consultorio-grid > label:nth-child(9) select",
      )
      .forEach((select) => {
        select.disabled = step > 1;
        if (select.parentElement)
          select.parentElement.style.display = step > 1 ? "none" : "";
      });
    const hiddenNewRegistrationSelect =
      document.querySelector<HTMLSelectElement>(
        ".cokifimi-consultorio-form > section:first-of-type .cokifimi-consultorio-grid > label:nth-child(8) select",
      );
    if (hiddenNewRegistrationSelect)
      hiddenNewRegistrationSelect.required = false;
    document
      .querySelectorAll<HTMLInputElement>(
        '.cokifimi-consultorio-form input[type="date"]',
      )
      .forEach((dateInput) => {
        // El titular puede quedar condicionado por su propia atención de obras sociales;
        // las fechas del profesional adjunto siempre son editables.
        const parentText = dateInput.parentElement?.textContent?.toUpperCase() || "";
        const sectionText = dateInput.closest("section")?.textContent?.toUpperCase() || "";
        const isAdjuntoDate = String(dateInput.dataset.fieldKey || "").startsWith("adjunto") || sectionText.includes("PROFESIONAL ADJUNTO");
        if (isAdjuntoDate) {
          // Las fechas del adjunto siempre pueden corregirse por el colegiado o Administración.
          // En el Alta se bloquea el dato únicamente después de consultar la matrícula.
          const ordinal = String(dateInput.dataset.fieldKey || "").endsWith("2") ? 2 : 1;
          dateInput.disabled = true;
        } else if (
          step === 1 &&
          parentText.includes("ANSSAL")
        ) {
          dateInput.disabled = data.atiendeObrasSociales !== "SI";
        }
      });
  }, [data.atiendeObrasSociales, lookupCompletedByOrdinal, step]);
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(
      ".cokifimi-consultorio-form",
    );
    if (form) form.noValidate = true;
  }, []);
  const set = (key: string, value: string | boolean) => {
    // Una modificación vuelve a validar el formulario con los valores actuales.
    // Evita que un error registrado antes de editar bloquee la previsualización.
    missingByStep.current = {};
    setData((current) => {
      if (key === "gimnasioTerapeutico" && value !== "SI") return { ...current, [key]: value, capacidadGimnasioTerapeutico: "", anexoI: "" };
      if (key === "gimnasioDeportivo" && value !== "SI") return { ...current, [key]: value, capacidadGimnasioDeportivo: "", anexoII: "" };
      if (key === "tipoArea") {
        const selectedArea = String(value || "");
        const adjuntoCount = getAdjuntoCount(selectedArea);
        const next: ConsultorioFormValues = { ...current, [key]: value, adjuntoIncluido: adjuntoCount > 0 ? "SI" : "NO" };
        Object.keys(next).forEach((fieldKey) => {
          const isAdjuntoField = /^(?:adjunto(?!Incluido)|certificado(?:Anssal|Praxis).*Adjunto|polizaPraxisArchivoAdjunto)/i.test(fieldKey);
          const adjuntoOrdinal = Number(fieldKey.match(/([2-8])$/)?.[1] || 1);
          if (isAdjuntoField && (adjuntoCount === 0 || adjuntoOrdinal > adjuntoCount)) next[fieldKey] = "";
        });
        setAdjuntoSearchByOrdinal((currentSearch) => Object.fromEntries(
          Object.entries(currentSearch).filter(([ordinal]) => Number(ordinal) <= adjuntoCount),
        ));
        setLookupCompletedByOrdinal((currentLookup) => Object.fromEntries(
          Object.entries(currentLookup).filter(([ordinal]) => Number(ordinal) <= adjuntoCount),
        ));
        return next;
      }

      return { ...current, [key]: value };
    });
  };
  const isSystemFilledAdjuntoField = (key: string) =>
    /^adjunto(?:Titulo|Apellido|Nombres|Dni|Cuil|ObrasSociales|Anssal|AnssalDesde|AnssalHasta|CompaniaSeguro|PolizaSeguro|SeguroDesde|SeguroHasta|InicioActividad|Asociado)(?:[2-8])?$/.test(key);
  // El tipo de área kinésica define si hay declaración jurada del adjunto.
  const tipoArea = String(data.tipoArea || "");
  const adjuntosDeclarados = getAdjuntoCount(tipoArea);
  const hasProfesionalAdjunto = adjuntosDeclarados > 0;
  // 4 sin adjuntos, 5 con un adjunto, 6 con dos adjuntos.
  const adjuntoStep = hasProfesionalAdjunto ? 4 : 0;
  const segundoAdjuntoStep = adjuntosDeclarados > 1 ? 5 : 0;
  const documentsStep = 4 + adjuntosDeclarados;
  useEffect(() => {
    if (step > documentsStep) setStep(documentsStep);
  }, [documentsStep, step]);
  useEffect(() => {
    const adjuntoIncluido = hasProfesionalAdjunto ? "SI" : "NO";
    // Ciudad del Colegio y fecha del día quedan fijas para cada adjunto.
    const fixed: ConsultorioFormValues = { adjuntoIncluido };
    for (let ordinal = 1; ordinal <= adjuntosDeclarados; ordinal += 1) {
      const suffix = ordinal > 1 ? String(ordinal) : "";
      fixed[`adjuntoCiudadDeclaracion${suffix}`] = CIUDAD_DECLARACION;
      fixed[`adjuntoFechaDeclaracion${suffix}`] = today();
    }
    setData((current) =>
      Object.entries(fixed).every(([key, value]) => current[key] === value)
        ? current
        : { ...current, ...fixed },
    );
  }, [adjuntosDeclarados, hasProfesionalAdjunto]);
  const consultorioAddresses = Array.from(
    new Set(
      consultoriosDisponibles
        .map((consultorio) => consultorio.domicilio.trim())
        .filter(Boolean),
    ),
  );
  const selectedConsultorio = selectedConsultorioIndex >= 0 ? consultoriosDisponibles[selectedConsultorioIndex] : undefined;
  const selectConsultorio = (index: number) => {
    if (index < 0) {
      setSelectedConsultorioIndex(-1);
      setData((current) => ({
        ...current,
        domicilioConsultorio: "",
        numeroConsultorio: "",
        localidadConsultorio: "",
        codigoPostalConsultorio: "",
        telefonoConsultorio: "",
        celularConsultorio: "",
        mailConsultorio: "",
        fechaInicioActividad: "",
      }));
      return;
    }

    const consultorio = consultoriosDisponibles[index];
    if (!consultorio || isConsultorioUsed(consultorio) || isAdjuntoConsultorio(consultorio)) return;
    setSelectedConsultorioIndex(index);
    setData((current) => ({
      ...current,
      domicilioConsultorio: consultorio.domicilio || "",
      numeroConsultorio: consultorio.numeracion || "",
      localidadConsultorio: normalizeMisionesLocality(consultorio.ciudad || ""),
      codigoPostalConsultorio: record.codigoPostal || "",
      telefonoConsultorio: record.telefono || "",
      celularConsultorio: record.celular || "",
      mailConsultorio: record.email || "",
      fechaInicioActividad: consultorio.fechaInicioConsultorio || record.fechaInicioConsultorio || "",
    }));
  };
  const consultorioReadOnlyField = (label: string, value: unknown, wide = false) => (
    <label className={wide ? "wide" : undefined}>
      {label}
      <input value={String(value || "")} readOnly />
    </label>
  );
  const optionalInsuranceFields = [
    "companiaSeguro",
    "polizaSeguro",
    "seguroDesde",
    "seguroHasta",
  ];
  const input = (
    label: string,
    key: string,
    type = "text",
    required = true,
  ) => {
    const isConsultorioAddress = key === "domicilioConsultorio";
    const isConsultorioLocality = key === "localidadConsultorio";
    const isFixedEmail = key === "mailConsultorio";
    const isFixedDeclarationCity = key === "ciudadDeclaracion";
    return (
      <label className={isFixedDeclarationCity ? "cokifimi-hidden-declaration-city" : undefined}>
        {label}
        <input
          type={type}
          data-field-key={key}
          required={required && !optionalInsuranceFields.includes(key)}
          readOnly={isFixedEmail || isFixedDeclarationCity || isSystemFilledAdjuntoField(key) || ["companiaSeguro", "polizaSeguro", "seguroDesde", "seguroHasta", "anssalDesde", "anssalHasta"].includes(key)}
          list={
            isConsultorioAddress
              ? "consultorio-addresses"
              : isConsultorioLocality
                ? "consultorio-localities"
                : undefined
          }
          value={String(data[key] || "")}
          onChange={(e) => {
            if (isConsultorioAddress) {
              const selected = (record.consultorios || []).find(
                (consultorio) =>
                  consultorio.domicilio.trim() === e.target.value.trim(),
              );
              if (selected) {
                setData((current) => ({
                  ...current,
                  domicilioConsultorio: selected.domicilio,
                  numeroConsultorio: selected.numeracion || "",
                  localidadConsultorio: normalizeMisionesLocality(selected.ciudad || ""),
                  fechaInicioActividad: selected.fechaInicioConsultorio || "",
                }));
                return;
              }
            }
            if (isConsultorioLocality) {
              const locality = normalizeMisionesLocality(e.target.value);
              setData((current) => ({
                ...current,
                localidadConsultorio: locality,
                codigoPostalConsultorio:
                  CONSULTORIO_LOCALITIES[locality] ||
                  current.codigoPostalConsultorio ||
                  "",
              }));
              return;
            }
            set(key, e.target.value);
          }}
        />
        {isConsultorioAddress && (
          <datalist id="consultorio-addresses">
            {consultorioAddresses.map((address) => (
              <option key={address} value={address} />
            ))}
          </datalist>
        )}
        {isConsultorioLocality && (
          <datalist id="consultorio-localities">
            {MISIONES_LOCALITY_OPTIONS.map((locality) => (
              <option key={locality} value={locality} />
            ))}
          </datalist>
        )}
      </label>
    );
  };
  const explainMissingField = (label: string) => {
    const clean = label.replace(/\s+/g, " ").trim();
    const lower = clean.toLowerCase();
    if (lower.includes("certificado anssal") && lower.includes("adjunto")) {
      return `PROFESIONAL ADJUNTO · Formulario del adjunto: consultar la matrícula y cargar el certificado ANSSAL vigente.`;
    }
    if (lower.includes("certificado anssal")) {
      return `TITULAR · Paso 1, Datos del profesional: cargar el certificado ANSSAL vigente.`;
    }
    if (lower.includes("anssal desde")) {
      return `TITULAR O ADJUNTO · Datos de ANSSAL: completar la fecha “ANSSAL desde”.`;
    }
    if (lower.includes("anssal hasta")) {
      return `TITULAR O ADJUNTO · Datos de ANSSAL: completar la fecha “ANSSAL hasta”.`;
    }
    if (lower.includes("póliza") || lower.includes("poliza")) {
      return `SEGURO DE PRAXIS · Datos del profesional: cargar la póliza vigente o completar el dato indicado.`;
    }
    return `FORMULARIO · Completar: ${clean}.`;
  };
  const showMissingRequiredModal = (labels: string[]) => {
    document.querySelector(".cokifimi-missing-required-modal")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "cokifimi-missing-required-modal";
    const explainedLabels = Array.from(new Set(labels)).map(explainMissingField);
    overlay.innerHTML = `<div class="cokifimi-missing-required-card"><div class="cokifimi-missing-required-label">Datos incompletos</div><h2>Faltan datos obligatorios</h2><p class="cokifimi-missing-required-help">Para continuar, revisá cada aviso en la sección indicada del formulario:</p><ul class="cokifimi-missing-required-items">` + explainedLabels.map((label) => `<li>${label}</li>`).join("") + `</ul><p class="cokifimi-missing-required-note">Volvé al paso correspondiente, completá el dato o cargá el archivo y luego intentá guardar nuevamente.</p><button type="button">Aceptar</button></div>`;
    overlay
      .querySelector("button")
      ?.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  };  const normalizeMatricula = (value: unknown) => String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const normalizeYesNoValue = (value: unknown) => {
    if (typeof value === "boolean") return value ? "SI" : "NO";
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const normalized = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .toUpperCase();
    if (["SI", "S", "YES", "Y", "TRUE", "VERDADERO", "V"].includes(normalized)) return "SI";
    if (["NO", "N", "FALSE", "FALSO", "0"].includes(normalized)) return "NO";
    return raw;
  };
  const matriculasCoinciden = (left: unknown, right: unknown) => {
    const normalizedLeft = normalizeMatricula(left).replace(/^0+(?=\d)/, "");
    const normalizedRight = normalizeMatricula(right).replace(/^0+(?=\d)/, "");
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
  };
  const findMatriculaCandidates = (candidate: Partial<DeclarationData> | null | undefined) => {
    if (!candidate) return [] as string[];
    const values = [
      candidate.matricula,
      candidate.numeroMatriculaConsultorio,
      candidate.formularioHabilitacionConsultorio?.matricula,
      candidate.formularioHabilitacionConsultorio?.numeroMatriculaConsultorio,
    ];
    if (Array.isArray(candidate.consultorios)) {
      candidate.consultorios.forEach((consultorio) => {
        values.push(consultorio?.numeroMatriculaConsultorio);
      });
    }
    return values.filter((value): value is string => typeof value === "string" || typeof value === "number").map((value) => normalizeMatricula(value));
  };
  const isAdjuntoRecord = (candidate: Partial<DeclarationData> | null | undefined) => {
    if (!candidate) return false;
    if (normalizeYesNoValue(candidate.esProfesionalAdjunto) === "SI") return true;
    const storedForm = candidate.formularioHabilitacionConsultorio || {};
    if (normalizeYesNoValue(storedForm.esProfesionalAdjunto) === "SI") return true;
    return Array.isArray(candidate.consultorios)
      ? candidate.consultorios.some((consultorio) => (
        normalizeYesNoValue(consultorio?.esTitularConsultorio) === "NO" &&
        normalizeYesNoValue(consultorio?.esProfesionalAdjunto) === "SI"
      ))
      : false;
  };
  const hasCurrentAdjuntoDocuments = (candidate: Partial<DeclarationData> | null | undefined) => {
    if (!candidate) return false;
    const form = candidate.formularioHabilitacionConsultorio || {};
    const praxis = String(candidate.polizaPraxisArchivo || form.polizaPraxisArchivo || "").trim();
    const desde = String(candidate.seguroDesde || form.seguroDesde || "").trim();
    const hasta = String(candidate.seguroHasta || form.seguroHasta || "").trim();
    return Boolean(praxis && desde && hasta);
  };
  const showAdjuntoLookupModal = (message: string, variant: "error" | "success" = "error") => {
    document.querySelector(".cokifimi-adjunto-lookup-modal")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "cokifimi-adjunto-lookup-modal " + (variant === "error" ? "is-error" : "is-success");
    const title = variant === "success" ? "Profesional encontrado y rellenado correctamente" : "Validación del profesional adjunto";
    const helperText = variant === "success"
      ? "Los datos del profesional se completaron correctamente con la información vigente del sistema."
      : "Verificá la matrícula del colegiado y su condición de profesional adjunto antes de continuar.";
    overlay.innerHTML = `<div class="cokifimi-adjunto-lookup-card"><strong>${title}</strong><h2>${message}</h2><p>${helperText}</p><button type="button">Aceptar</button></div>`;
    overlay
      .querySelector("button")
      ?.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  };
  const parseDateValue = (value: string | undefined | null) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T00:00:00`);
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('/').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const isActiveBianualRecord = (candidate: Partial<DeclarationData> | null | undefined) => {
    if (!candidate || !candidate.fechaPresentacion || !candidate.fechaVencimiento) return false;
    const presentationDate = parseDateValue(candidate.fechaPresentacion);
    const expiryDate = parseDateValue(candidate.fechaVencimiento);
    if (!presentationDate || !expiryDate || Number.isNaN(presentationDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
      return false;
    }
    const normalizedName = `${candidate.apellido || ""} ${candidate.nombres || ""}`.trim().toLowerCase();
    const hasRealIdentity = Boolean(
      candidate.apellido &&
      candidate.nombres &&
      candidate.dni &&
      candidate.matricula &&
      !/(sin declaraci[oó]n|colegiado\s+sin|sin datos|pendiente)/i.test(normalizedName),
    );
    return hasRealIdentity && presentationDate <= new Date() && expiryDate >= new Date();
  };
  const normalizeInputDate = (value: unknown) => {
    if (typeof value !== "string") return String(value ?? "");
    const raw = value.trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split("/").map(Number);
      if (day && month && year) {
        const date = new Date(year, month - 1, day);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString().slice(0, 10);
        }
      }
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return raw;
  };
  const formatFieldValueForInput = (fieldKey: string, value: string) => {
    const lowerKey = fieldKey.toLowerCase();
    if (
      /fecha|desde|hasta|inicioactividad/.test(lowerKey) &&
      value &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return normalizeInputDate(value);
    }
    return value;
  };
  const valueFromRecord = (candidate: Partial<DeclarationData>, keys: string[]) => {
    const normalizedKeys = new Set(keys.map((key) => String(key)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()));

    const parseScalarValue = (value: unknown): string => {
      if (value === undefined || value === null || value === "") return "";
      if (typeof value === "boolean") return normalizeYesNoValue(value);
      if (typeof value === "number") {
        const normalized = normalizeYesNoValue(value);
        if (normalized === "") return "";
        if (/(^SI$|^NO$)/i.test(normalized)) return normalized;
        return String(value);
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const normalized = normalizeYesNoValue(trimmed);
        if (normalized === "") return "";
        if (/^(SI|NO)$/i.test(normalized)) return normalized;
        return trimmed;
      }
      return "";
    };

    const visit = (node: unknown, visited = new Set<unknown>()): string => {
      if (!node || typeof node !== "object") return "";
      if (visited.has(node)) return "";
      visited.add(node);

      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item, visited);
          if (found) return found;
        }
        return "";
      }

      const record = node as Record<string, unknown>;
      for (const [rawKey, value] of Object.entries(record)) {
        const normalizedKey = String(rawKey)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();

        if (normalizedKeys.has(normalizedKey)) {
          const parsed = parseScalarValue(value);
          if (parsed) return parsed;
        }
      }

      for (const nestedValue of Object.values(record)) {
        if (nestedValue && typeof nestedValue === "object") {
          const found = visit(nestedValue, visited);
          if (found) return found;
        }
      }

      return "";
    };

    return visit(candidate);
  };
  const loadAdjuntoFromMatricula = async (ordinal: number) => {
    const key = (name: string) => adjuntoKey(name, ordinal);
    const matricula = String(adjuntoSearchByOrdinal[ordinal] ?? data[key("adjuntoMatricula")] ?? "").trim();
    setLookupLoadingByOrdinal((current) => ({ ...current, [ordinal]: true }));

    try {
      if (!matricula) {
        showAdjuntoLookupModal("Profesional no se encuentra vigente en el sistema");
        return;
      }

      let matches: DeclarationData[] = [];
      try {
        const storedRecords = JSON.parse(localStorage.getItem("cokifimi_declarations") || "[]") as DeclarationData[];
        matches = Array.isArray(storedRecords) ? storedRecords : [];
      } catch (error) {
        console.error("No se pudo leer la copia local de registros", error);
      }

      if ((window as Window & { cokifimiSettings?: { apiBase?: string } }).cokifimiSettings?.apiBase) {
        // Consultar directamente evita depender de la lista protegida del portal.
        let directMatch: DeclarationData | null = null;
        try {
          directMatch = await lookupServerRecord(matricula);
          if (directMatch) matches = [...matches, directMatch];
        } catch (error) {
          console.warn("La consulta directa por matrícula no encontró un registro.", error);
        }
        // La consulta directa devuelve el colegiado exacto; no cargar todos los registros.
        if (!directMatch) console.warn("No se encontró la matrícula mediante la consulta directa.");
      }

      const normalizedSearch = normalizeMatricula(matricula);
      const ownId = String(record.id || "");
      const ownMatricula = normalizeMatricula(record.matricula);
      const ownDni = String(record.dni || "").replace(/\D/g, "");
      const matchingRecords = matches.filter((item) => {
        // Nunca permitir seleccionarse a sí mismo como profesional adjunto.
        if (String(item.id || "") === ownId) return false;
        if (ownMatricula && matriculasCoinciden(item.matricula, ownMatricula)) return false;
        if (ownDni && String(item.dni || "").replace(/\D/g, "") === ownDni) return false;
        const currentVariants = findMatriculaCandidates(item);
        return currentVariants.some((value) => matriculasCoinciden(value, normalizedSearch));
      });

      // Combinar copias locales y del servidor para no perder campos completos.
      const deduped = Array.from(
        matchingRecords.reduce((grouped, item) => {
          const current = grouped.get(item.id);
          if (!current) {
            grouped.set(item.id, item);
            return grouped;
          }
          grouped.set(item.id, {
            ...current,
            ...item,
            formularioHabilitacionConsultorio: {
              ...(current.formularioHabilitacionConsultorio || {}),
              ...(item.formularioHabilitacionConsultorio || {}),
            },
          });
          return grouped;
        }, new Map<string, DeclarationData>()).values(),
      );
      const activeRecord = deduped.find((item) => isActiveBianualRecord(item));
      const activeMatch = deduped.find((item) => isActiveBianualRecord(item) && isAdjuntoRecord(item));
      if (!activeMatch) {
        showAdjuntoLookupModal(
          activeRecord && !isAdjuntoRecord(activeRecord)
            ? "MATRÍCULA NO CORRESPONDE A UN PROFESIONAL ADJUNTO"
            : "MATRÍCULA NO CORRESPONDE A UN PROFESIONAL ADJUNTO",
        );
        return;
      }
      const selectedMatricula = normalizeMatricula(String(valueFromRecord(activeMatch, ["matricula"]) || matricula));
      const alreadyLoaded = ["", ...Array.from({ length: 7 }, (_, index) => String(index + 2))]
        .filter((existingOrdinal) => existingOrdinal !== (ordinal > 1 ? String(ordinal) : ""))
        .some((existingOrdinal) => matriculasCoinciden(String(data[`adjuntoMatricula${existingOrdinal}`] || ""), selectedMatricula));
      if (alreadyLoaded) {
        showAdjuntoLookupModal("COLEGIADO ADJUNTO YA FUE AGREGADO A ESTE CONSULTORIO");
        return;
      }
      if (!hasCurrentAdjuntoDocuments(activeMatch)) {
        showAdjuntoLookupModal("El profesional adjunto que quiere asociar debe actualizar su declaración jurada y cargar la póliza de praxis con sus fechas de vigencia.");
        return;
      }
      const fieldsToPopulate: Array<[string, string]> = [
        [key("adjuntoApellido"), valueFromRecord(activeMatch, ["apellido"])],
        [key("adjuntoNombres"), valueFromRecord(activeMatch, ["nombres"])],
        [key("adjuntoDni"), valueFromRecord(activeMatch, ["dni"])],
        [key("adjuntoCuil"), valueFromRecord(activeMatch, ["cuilCuit"])],
        [key("adjuntoTitulo"), valueFromRecord(activeMatch, ["tituloUniversitario"])],
        [key("adjuntoMatricula"), String(valueFromRecord(activeMatch, ["matricula"]) || matricula)],
        [key("adjuntoObrasSociales"), valueFromRecord(activeMatch, ["atiendeObrasSociales", "adjuntoObrasSociales", "obrasSociales"]) || "NO"],
        [key("adjuntoAnssal"), valueFromRecord(activeMatch, ["poseeAnssal", "adjuntoAnssal", "anssal"]) || "NO"],
        [key("adjuntoAnssalDesde"), valueFromRecord(activeMatch, ["anssalDesde", "adjuntoAnssalDesde"])],
        [key("adjuntoAnssalHasta"), valueFromRecord(activeMatch, ["anssalHasta", "adjuntoAnssalHasta"])],
        [key("adjuntoCompaniaSeguro"), valueFromRecord(activeMatch, ["companiaSeguro", "adjuntoCompaniaSeguro"])],
        [key("adjuntoPolizaSeguro"), valueFromRecord(activeMatch, ["polizaSeguro", "adjuntoPolizaSeguro"])],
        [key("adjuntoSeguroDesde"), valueFromRecord(activeMatch, ["seguroDesde", "adjuntoSeguroDesde"])],
        [key("adjuntoSeguroHasta"), valueFromRecord(activeMatch, ["seguroHasta", "adjuntoSeguroHasta"])],
        [key("adjuntoInicioActividad"), valueFromRecord(activeMatch, ["fechaInicioConsultorio", "fechaInicioActividad", "adjuntoInicioActividad"])],
        [key("adjuntoAsociado"), valueFromRecord(activeMatch, ["asociadoAsociacion", "esAuditorObraSocialArt", "adjuntoAsociado", "asociado"]) || "NO"],
        [key("adjuntoFotoUrl"), valueFromRecord(activeMatch, ["fotoUrl", "adjuntoFotoUrl"]) || localStorage.getItem(`cokifimi_declaration_photo_${activeMatch.id}`) || ""],
      ];
      const suffix = ordinal > 1 ? String(ordinal) : "";
      const attachmentFields: Array<[string, string]> = [
        [`certificadoAnssalArchivoAdjunto${suffix}`, valueFromRecord(activeMatch, ["certificadoAnssalArchivo", `certificadoAnssalArchivoAdjunto${suffix}`])],
        [`polizaPraxisArchivoAdjunto${suffix}`, valueFromRecord(activeMatch, ["polizaPraxisArchivo", `polizaPraxisArchivoAdjunto${suffix}`])],
        [`certificadoAnssalArchivoAdjunto${suffix}Nombre`, valueFromRecord(activeMatch, ["certificadoAnssalArchivoNombre", `certificadoAnssalArchivoAdjunto${suffix}Nombre`])],
        [`polizaPraxisArchivoAdjunto${suffix}Nombre`, valueFromRecord(activeMatch, ["polizaPraxisArchivoNombre", `polizaPraxisArchivoAdjunto${suffix}Nombre`])],
      ];
      [...fieldsToPopulate, ...attachmentFields].forEach(([fieldKey, value]) => set(fieldKey, formatFieldValueForInput(fieldKey, value)));
      setLookupCompletedByOrdinal((current) => ({ ...current, [ordinal]: true }));
      showAdjuntoLookupModal("Profesional encontrado y rellenado correctamente", "success");
    } finally {
      setLookupLoadingByOrdinal((current) => ({ ...current, [ordinal]: false }));
    }
  };
  // Al editar un Alta existente, refrescar cada adjunto desde el Bianual vigente.
  // Así los cambios del colegiado en fechas y datos se reflejan automáticamente.
  useEffect(() => {
    for (let ordinal = 1; ordinal <= adjuntosDeclarados; ordinal += 1) {
      const suffix = ordinal > 1 ? String(ordinal) : "";
      const matricula = String(data[`adjuntoMatricula${suffix}`] || "").trim();
      if (matricula && !lookupCompletedByOrdinal[ordinal]) {
        void loadAdjuntoFromMatricula(ordinal);
      }
    }
    // Solo se ejecuta al abrir/cambiar el registro del Alta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);  const select = (label: string, key: string) => {
    const lockedFromBianual = key === "atiendeObrasSociales" || key === "asociadoAsociacion" || isSystemFilledAdjuntoField(key);
    return (
      <label className={`${key.includes("adjuntoAsociado") ? "cokifimi-adjunto-asociacion-field " : ""}${lockedFromBianual ? "cokifimi-inherited-field" : ""}`}>
        {label}
        {lockedFromBianual ? (
          <input
            type="text"
            value={String(data[key] || "") === "SI" ? "Sí" : String(data[key] || "") === "NO" ? "No" : String(data[key] || "")}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
            className="cokifimi-fixed-inherited-input"
          />
        ) : (
          <select
            required
            value={String(data[key] || "")}
            onChange={(e) => set(key, e.target.value)}
          >
            <option value="">Seleccionar</option>
            {yesNo.map((item) => (
              <option key={item} value={item}>
                {item === "SI" ? "Sí" : "No"}
              </option>
            ))}
          </select>
        )}
      </label>
    );
  };
  const text = (label: string, key: string, required = false) => (
    <label className="wide">
      {label}
      <textarea
        required={required}
        value={String(data[key] || "")}
        readOnly={isSystemFilledAdjuntoField(key)}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const getMissingRequiredFields = (form: HTMLFormElement) =>
    Array.from(
      form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("[required]"),
    )
      .filter((field) => {
        if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "file")) {
          return false;
        }
        return !field.disabled && !String(field.value || "").trim();
      })
      .map(
        (field) =>
          field.parentElement?.textContent
            ?.replace(/Seleccionar|Archivo cargado:.*/gi, "")
            .replace(/(?:SíNo|SINo|SI|NO)$/i, "")
            .replace(/\s+/g, " ")
            .trim() || "Campo obligatorio",
      );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const missing = Array.from(new Set(getMissingRequiredFields(form)));
    missingByStep.current[step] = missing;
    // Validación adicional: si un adjunto declara ANSSAL = "SI", exigir fechas
    const extraMissing: string[] = [];
    if (step === 1 && !CONSULTORIO_AREA_OPTIONS.includes(String(data.tipoArea || "").trim())) {
      extraMissing.push("Tipo de área kinésica");
    }
    if (step === 2 && (selectedConsultorioIndex < 0 || !String(data.domicilioConsultorio || "").trim())) {
      extraMissing.push("Debe seleccionar un domicilio titular para continuar");
    }
    if (step === 2 && selectedConsultorio && isAdjuntoConsultorio(selectedConsultorio)) extraMissing.push("No puede dar de alta un domicilio donde figura como profesional adjunto");
    if (step === 2 && data.localidadConsultorio && !MISIONES_LOCALITY_OPTIONS.includes(normalizeMisionesLocality(data.localidadConsultorio))) {
      extraMissing.push("Seleccione una localidad válida de Misiones");
    }
    if (step === documentsStep) {
      visibleRequiredDocuments.forEach(([key, label]) => {
        if (!OPTIONAL_DOCUMENTS.includes(key) && !String(data[key] || "").trim()) extraMissing.push(label);
      });
    }
    const stepMissing = Array.from(new Set([...missing, ...extraMissing]));
    missingByStep.current[step] = stepMissing;
    if (stepMissing.length) {
      showMissingRequiredModal(stepMissing);
      return;
    }
    if (step < documentsStep) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const allMissing = Array.from(
      new Set(Object.values(missingByStep.current).flat()),
    );
    if (allMissing.length) {
      showMissingRequiredModal(allMissing);
      return;
    }
    if (step === documentsStep) {
      const finalMissing = [...stepMissing];
      if (consultoriosDisponibles.length > 0 && selectedConsultorioIndex < 0) finalMissing.push("Debe seleccionar un domicilio de consultorio");
      if (!String(data.domicilioConsultorio || "").trim()) finalMissing.push("Domicilio del consultorio");
      if (!String(data.localidadConsultorio || "").trim() || !MISIONES_LOCALITY_OPTIONS.includes(normalizeMisionesLocality(data.localidadConsultorio))) finalMissing.push("Localidad del consultorio");
      visibleRequiredDocuments.forEach(([key, label]) => {
        if (!OPTIONAL_DOCUMENTS.includes(key) && !String(data[key] || "").trim()) finalMissing.push(label);
      });
      const uniqueFinalMissing = Array.from(new Set(finalMissing));
      if (uniqueFinalMissing.length) {
        showMissingRequiredModal(uniqueFinalMissing);
        return;
      }
    }
    if (!adminEdit && !data.declaraVeracidad) {
      const legalCheckbox = form.querySelector<HTMLInputElement>(
        'input[type="checkbox"][aria-label="Acepto la declaración de veracidad"]',
      );
      legalCheckbox?.focus();
      legalCheckbox?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const preparedRecord = {
      ...record,
      formularioHabilitacionConsultorio: {
        ...data,
        // Todo el formulario es alta de consultorio.
        nuevaHabilitacion: "SI",
        renovacionHabilitacion: "NO",
        anssalDesde: data.anssalDesde || "",
        anssalHasta: data.anssalHasta || "",
      },
    };
    if (adminEdit) {
      setPreviewData(preparedRecord);
      return;
    }
    onReview(preparedRecord);
  };
  // Si atiende por obras sociales, el certificado ANSSAL es obligatorio.
  const isAffirmative = (value: unknown) => /^(SI|SÍ|YES|TRUE|1)$/i.test(String(value || "").trim());
  const requiresAnssalAttachment =
    data.atiendeObrasSociales === "SI" ||
    data.adjuntoObrasSociales === "SI" ||
    data.adjuntoObrasSociales2 === "SI";
  const requiredDocuments = [
    ["planoMunicipalArchivo", "Plano edilicio habilitado y aprobado por la Municipalidad"],
    ["certificadoBomberosArchivo", "Certificado de bomberos vigente (opcional)"],
  ] as const;
  const OPTIONAL_DOCUMENTS: readonly string[] = ["certificadoBomberosArchivo"];
  const visibleRequiredDocuments = requiredDocuments;
  const uploadDocument = (key: string, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setData((current) => ({
        ...current,
        [key]: content,
        [`${key}Nombre`]: file.name,
      }));
      const storageKey = `cokifimi_consultorio_adjuntos_${record.id}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...stored,
          [key]: content,
          [`${key}Nombre`]: file.name,
        }),
      );
    };
    reader.readAsDataURL(file);
  };
  const section = (title: string, children: ReactNode, note?: string) => (
    <section>
      <h2>{title}</h2>
      {note && <p className="cokifimi-consultorio-note">{note}</p>}
      <div className="cokifimi-consultorio-grid">{children}</div>
    </section>
  );
  const requiredDocumentsBlock = (
    <div className="cokifimi-consultorio-documents">
      <h3>Documentación obligatoria</h3>
      <p>
        Debe adjuntar todos los certificados requeridos para presentar la
        habilitación.
      </p>
      {visibleRequiredDocuments.map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            required={!OPTIONAL_DOCUMENTS.includes(key) && !data[key]}
            onChange={(event) => uploadDocument(key, event.target.files?.[0])}
          />
          {data[key] && <small className="cokifimi-consultorio-inherited-document"><CheckCircle2 size={15} aria-hidden="true" /> Archivo cargado</small>}
        </label>
      ))}

      {Array.from({ length: adjuntosDeclarados }, (_, index) => index + 1).flatMap((ordinal) => {
        const suffix = ordinal > 1 ? String(ordinal) : "";
        return [
          [`certificadoAnssalArchivoAdjunto${suffix}`, `Certificado ANSSAL del adjunto ${ordinal}`, data[`adjuntoObrasSociales${suffix}`] === "SI"],
          [`polizaPraxisArchivoAdjunto${suffix}`, `Póliza de praxis del adjunto ${ordinal}`, true],
        ] as Array<[string, string, boolean]>;
      }).map(([key, label, required]) => (
        <label key={key}>
          {label}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            required={false}
            disabled
            aria-label="Certificado recuperado automáticamente desde la consulta por matrícula"
          />
          {data[`${key}Nombre`] ? (
            <small className="cokifimi-consultorio-inherited-document"><CheckCircle2 size={15} aria-hidden="true" /> Archivo recuperado del profesional: {String(data[`${key}Nombre`])}</small>
          ) : (
            <small>Este certificado debe recuperarse mediante la consulta por matrícula.</small>
          )}
        </label>
      ))}
    </div>
  );
  const inlineDocumentUpload = (key: "certificadoAnssalArchivo" | "polizaPraxisArchivo", label: string, required: boolean) => (
    <label className="cokifimi-consultorio-inline-document">
      <span>{label}</span>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        required={false}
        onChange={(event) => uploadDocument(key, event.target.files?.[0])}
      />
      {data[key + "Nombre"] ? (
        <small>Archivo cargado: {String(data[key + "Nombre"])}</small>
      ) : (
        <small>Ningún archivo seleccionado</small>
      )}
    </label>
  );
  // Una declaración jurada por profesional adjunto. El segundo adjunto usa las
  // mismas claves con sufijo "2" (adjuntoApellido2, adjuntoDni2, ...).
  const clearAdjuntoFields = (ordinal: number) => {
    const key = (name: string) => adjuntoKey(name, ordinal);
    const fieldsToClear = [
      key("adjuntoApellido"),
      key("adjuntoNombres"),
      key("adjuntoDni"),
      key("adjuntoCuil"),
      key("adjuntoTitulo"),
      key("adjuntoMatricula"),
      key("adjuntoObrasSociales"),
      key("adjuntoAnssal"),
      key("adjuntoAnssalDesde"),
      key("adjuntoAnssalHasta"),
      key("adjuntoCompaniaSeguro"),
      key("adjuntoPolizaSeguro"),
      key("adjuntoSeguroDesde"),
      key("adjuntoSeguroHasta"),
      key("adjuntoInicioActividad"),
      key("adjuntoAsociado"),
      key("adjuntoCiudadDeclaracion"),
      key("adjuntoFechaDeclaracion"),
      key("adjuntoFotoUrl"),
      key("certificadoAnssalArchivoAdjunto"),
      key("polizaPraxisArchivoAdjunto"),
      key("certificadoAnssalArchivoAdjuntoNombre"),
      key("polizaPraxisArchivoAdjuntoNombre"),
    ];
    fieldsToClear.forEach((fieldKey) => set(fieldKey, ""));
    setAdjuntoSearchByOrdinal((current) => ({ ...current, [ordinal]: "" }));
    setLookupCompletedByOrdinal((current) => ({ ...current, [ordinal]: false }));
  };
  const adjuntoKey = (key: string, ordinal: number) =>
    ordinal > 1 ? `${key}${ordinal}` : key;
  const renderAdjuntoDeclaracion = (ordinal: number) => {
    const key = (name: string) => adjuntoKey(name, ordinal);
    const titulo = "Profesional adjunto a la Habilitación de Consultorio/Área Kinésica";
    return (
      <>
        <div className="cokifimi-adjunto-access-notice" role="note">
          <strong>Importante</strong>
          <span>Se solicitará al profesional adjunto el acceso y la aprobación de la información declarada antes de enviar esta documentación a Administración.</span>
        </div>
        {section(
          titulo,
          <>
            {/* Subtítulo: Datos del profesional adjunto */}
            <div className="cokifimi-adjunto-header md:items-center md:gap-6" style={{ marginBottom: '0.5rem' }}>
              <div className="cokifimi-adjunto-subtitle md:flex-shrink-0">
                <strong>Datos del profesional adjunto</strong>
              </div>
              <div className="mt-3 md:mt-0 flex flex-col md:flex-row md:items-center md:gap-4 flex-1 cokifimi-adjunto-right">
                <div className="adjunto-field cokifimi-hidden-declaration-city">
                  <div className="field-label">Ciudad de la declaración</div>
                  <input
                    value={String(data[key('adjuntoCiudadDeclaracion')] || CIUDAD_DECLARACION)}
                    readOnly
                  />
                </div>
                <div className="adjunto-field">
                  <div className="field-label">Fecha de solicitud</div>
                  <input
                    type="date"
                    value={today()}
                    readOnly
                  />
                </div>
              </div>
            </div>
            <label className="wide">
              Número de matrícula del profesional adjunto
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly={Boolean(lookupCompletedByOrdinal[ordinal])}
                  value={adjuntoSearchByOrdinal[ordinal] ?? String(data[key("adjuntoMatricula")] || "")}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    const currentValue = adjuntoSearchByOrdinal[ordinal] ?? String(data[key("adjuntoMatricula")] || "");
                    if (nextValue !== currentValue) {
                      clearAdjuntoFields(ordinal);
                    }
                    setAdjuntoSearchByOrdinal((current) => ({ ...current, [ordinal]: nextValue }));
                    set(key("adjuntoMatricula"), nextValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadAdjuntoFromMatricula(ordinal);
                    }
                  }}
                  placeholder="Ingrese matrícula"
                />
                <button
                  type="button"
                  onClick={() => void loadAdjuntoFromMatricula(ordinal)}
                  disabled={Boolean(lookupLoadingByOrdinal[ordinal])}
                  className="cokifimi-consultorio-lookup-button"
                >
                  {lookupLoadingByOrdinal[ordinal] ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      Buscando Profesional
                    </span>
                  ) : (
                    "Buscar"
                  )}
                </button>
                {lookupCompletedByOrdinal[ordinal] && (
                  <button type="button" onClick={() => clearAdjuntoFields(ordinal)} className="cokifimi-consultorio-lookup-button is-change">
                    Cambiar matrícula
                  </button>
                )}
              </div>
            </label>
            <label className="wide">
              Título universitario
              <select
                disabled
                // If stored value is in the official list show it, otherwise default to placeholder
                value={KINESIOLOGY_TITLES.includes(String(data[key('adjuntoTitulo')])) ? String(data[key('adjuntoTitulo')]) : ""}

                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'OTRO') {
                    set(key('adjuntoTitulo'), 'OTRO');
                  } else {
                    set(key('adjuntoTitulo'), val);
                  }
                }}
              >
                <option value="">SELECCIONE TÍTULO</option>
                {KINESIOLOGY_TITLES.map((titulo) => (
                  <option key={titulo} value={titulo}>{titulo}</option>
                ))}
              </select>
              {(String(data[key('adjuntoTitulo')]) === 'OTRO' || (String(data[key('adjuntoTitulo')]) && !KINESIOLOGY_TITLES.includes(String(data[key('adjuntoTitulo')])))) && (
                <input
                  type="text"
                  placeholder="Escriba el nombre del título universitario"
                  value={String(data[key('adjuntoTitulo')] || '')}
                  onChange={(e) => set(key('adjuntoTitulo'), e.target.value.toUpperCase())}
                  readOnly
                  className="w-full mt-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              )}
            </label>
            {input("Apellidos", key("adjuntoApellido"))}
            {input("Nombres", key("adjuntoNombres"))}
            {input(
              "Número de Documento Nacional de Identidad (DNI)",
              key("adjuntoDni"),
            )}
            {input("Número de CUIL/CUIT", key("adjuntoCuil"))}
            {select(
              "Atiende por medio de obras sociales",
              key("adjuntoObrasSociales"),
            )}
            <label className="cokifimi-adjunto-asociacion-field">
              Asociado/a a la Asociación de Kinesiólogos
              <select
                required
                disabled

                value={String(data[key("adjuntoAsociado")] || "")}
                onChange={(e) => set(key("adjuntoAsociado"), e.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="SI">Sí</option>
                <option value="NO">No</option>
              </select>
            </label>
            {select(
              "Posee certificado de Administración Nacional del Seguro de Salud (ANSSAL)",
              key("adjuntoAnssal"),
            )}
            {input(
              "Vigencia del certificado ANSSAL desde",
              key("adjuntoAnssalDesde"),
              "date",
              data[key("adjuntoObrasSociales")] === "SI",
            )}
            {input(
              "Vigencia del certificado ANSSAL hasta",
              key("adjuntoAnssalHasta"),
              "date",
              data[key("adjuntoObrasSociales")] === "SI",
            )}
            {input(
              "Nombre de la compañía del seguro de praxis médica",
              key("adjuntoCompaniaSeguro"),
            )}
            {input(
              "Número de la póliza de praxis médica",
              key("adjuntoPolizaSeguro"),
            )}
            {input(
              "Vigencia de la póliza desde",
              key("adjuntoSeguroDesde"),
              "date",
            )}
            {input(
              "Vigencia de la póliza hasta",
              key("adjuntoSeguroHasta"),
              "date",
            )}
            {input(
              "Fecha de inicio de actividad en la habilitación",
              key("adjuntoInicioActividad"),
              "date",
            )}
          </>,
          "Completar los espacios vacíos. Los datos consignados tienen carácter de declaración jurada.",
        )}
        <aside className="cokifimi-consultorio-legal">
          <strong>{titulo}</strong>
          <p>
            Los datos que constan en la presente declaración jurada se consignan
            en virtud de solicitar la Habilitación de Consultorio/Área Kinésica,
            previo cumplimiento de las normas vigentes a la fecha, que declara
            conocer y cumplimentar.
          </p>
          <p>
            PARA ESTE TRÁMITE EL PROFESIONAL ADJUNTO NO DEBE REGISTRAR DEUDAS CON
            EL COLEGIO Y SU DECLARACIÓN JURADA PROFESIONAL DEBE ESTAR
            ACTUALIZADA.
          </p>
          <p>
            DOCUMENTACIÓN A ADJUNTAR: constancia de inscripción a ANSSAL vigente
            y constancia de seguro de mala praxis del mes en curso.
          </p>
        </aside>
      </>
    );
  };
  const steps = [
    { label: "Titular responsable", detail: "Datos profesionales" },
    { label: "Consultorio", detail: "Instalaciones" },
    { label: "Sala de espera", detail: "Espacios comunes" },
    ...Array.from({ length: adjuntosDeclarados }, (_, index) => ({
      label: "Profesional adjunto",
      detail: "Datos del adjunto a la habilitación",
    })),
    {
      label: "ADJUNTAR DATOS OBLIGATORIOS",
      detail: "Certificados obligatorios",
    },
  ];
  const returnToEditFromPreview = () => {
    if (previewData?.formularioHabilitacionConsultorio) {
      setData((current) => ({ ...current, ...(previewData.formularioHabilitacionConsultorio as ConsultorioFormValues) }));
    }
    missingByStep.current = {};
    setPreviewData(null);
  };
  if (previewData) {
    return (
      <ConsultorioHabilitacionPreview
        data={previewData}
        saving={saving}
        isPendingSave
        onCancel={returnToEditFromPreview}
        onEdit={returnToEditFromPreview}
        onConfirm={() => {
          onReview(previewData);
          setPreviewData(null);
        }}
        backLabel="Volver al formulario"
      />
    );
  }

  return (
    <section className="cokifimi-member-form-shell cokifimi-consultorio-form-shell">
      <div className="cokifimi-member-form-return">
        <button type="button" onClick={onCancel}>
          <ArrowLeft /> Volver al panel del colegiado
        </button>
      </div>
      <form ref={formRef} noValidate className="cokifimi-consultorio-form" onSubmit={submit}>
        <header className="cokifimi-consultorio-wizard-header">
          <ClipboardList />
          <div>
            <span>FORMULARIO 2 · GESTIÓN PERSONAL</span>
            <h1>
              Alta de consultorio / área kinésica
            </h1>
            <p>
              Complete los pasos para generar la solicitud de habilitación lista
              para presentar.
            </p>
          </div>
        </header>
        <nav
          className="cokifimi-consultorio-stepper"
          aria-label="Progreso del formulario"
        >
          {steps.map(({ label, detail }, index) => {
            const position = index + 1;
            const completed = position < step;
            return (
              <button
                key={`${label}-${position}`}
                type="button"
                onClick={() => setStep(position)}
                className={
                  position === step ? "active" : completed ? "done" : ""
                }
              >
                <i>{completed ? <CheckCircle /> : position}</i>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            );
          })}
        </nav>
        {step === 1 && (
          <>
            {section(
              "Datos del profesional titular responsable",
              <>
                <label>
                  Apellidos
                  <input value={record.apellido} readOnly />
                </label>
                <label>
                  Nombres
                  <input value={record.nombres} readOnly />
                </label>
                <label>
                  Título universitario
                  <input value={record.tituloUniversitario} readOnly />
                </label>
                <label>
                  DNI
                  <input value={record.dni} readOnly />
                </label>
                <label>
                  CUIL/CUIT
                  <input value={record.cuilCuit} readOnly />
                </label>
                <label>
                  Matrícula provincial
                  <input value={record.matricula} readOnly />
                </label>
                {input("Ciudad", "ciudadDeclaracion")}
                <label className="wide cokifimi-area-type-field">
                  Tipo de área kinésica
                  <select className="cokifimi-area-type-select"
                    required

                    value={String(data.tipoArea || "")}
                    onChange={(e) => set("tipoArea", e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    {CONSULTORIO_AREA_OPTIONS.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>
                {select("Atiende por obras sociales", "atiendeObrasSociales")}
                {isAffirmative(data.atiendeObrasSociales) && data.certificadoAnssalArchivo && (
                  <small className="cokifimi-consultorio-inherited-document">
                    <CheckCircle2 size={15} aria-hidden="true" /> Certificado ANSSAL cargado desde el Formulario 1: {String(data.certificadoAnssalArchivoNombre || "Archivo cargado")}
                  </small>
                )}
                {select("Asociado/a a la Asociación de Kinesiólogos", "asociadoAsociacion")}
                {input("ANSSAL desde", "anssalDesde", "date", data.atiendeObrasSociales === "SI")}
                {input("ANSSAL hasta", "anssalHasta", "date", data.atiendeObrasSociales === "SI")}
                {input("Compañía del seguro de praxis médica", "companiaSeguro")}
                {input("Número de póliza", "polizaSeguro")}
                {input("Póliza vigente desde", "seguroDesde", "date")}
                {input("Póliza vigente hasta", "seguroHasta", "date")}
                {data.polizaPraxisArchivo && (
                  <small className="cokifimi-consultorio-inherited-document">
                    <CheckCircle2 size={15} aria-hidden="true" /> Póliza de praxis cargada desde el Formulario 1: {String(data.polizaPraxisArchivoNombre || "Archivo cargado")}
                  </small>
                )}
              </>,
              "Los datos personales se completan automáticamente con su Formulario 1.",
            )}
          </>
        )}
        {step === 2 &&
          section(
            "CONSULTORIO",
            <>
              {allConsultorios.length > 0 && consultoriosDisponibles.length === 0 && (
                <small className="cokifimi-consultorio-location-warning">
                  Las ubicaciones donde figura como adjunto no pueden darse de alta a su nombre. Debe ser titular del consultorio.
                </small>
              )}
              {consultoriosDisponibles.length === 0 && (
                <small className="cokifimi-consultorio-location-warning">
                  No existe ningún domicilio de consultorio en su declaración bianual para continuar con el alta.
                </small>
              )}
              {consultoriosDisponibles.length > 0 && (
                <div className="cokifimi-consultorio-location-selector wide">
                  <h3>SELECCIONAR SU CONSULTORIO A DAR EL ALTA</h3>
                  <p>Seleccione la ubicación declarada en su Formulario 1 bianual.</p>
                  <select value={selectedConsultorioIndex} onChange={(e) => selectConsultorio(Number(e.target.value))}>
                    <option value={-1}>Seleccionar domicilio</option>
                    {consultoriosDisponibles.map((consultorio, index) => (
                      <option key={`${consultorio.domicilio}-${consultorio.numeracion}-${index}`} value={index} disabled={isConsultorioUsed(consultorio) || isAdjuntoConsultorio(consultorio)}>
                        {consultorio.domicilio} {consultorio.numeracion ? `Nº ${consultorio.numeracion}` : ""} · {consultorio.ciudad}{isAdjuntoConsultorio(consultorio) ? " - Usted es adjunto de esta ubicación" : isConsultorioUsed(consultorio) ? " - Alta ya enviado para esta ubicación" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedConsultorioIndex < 0 && (
                    <small className="cokifimi-consultorio-location-warning">
                      Debe seleccionar un domicilio para continuar.
                    </small>
                  )}
                  {selectedConsultorio && (
                    <div className="cokifimi-consultorio-location-details">
                      {consultorioReadOnlyField("Dirección", selectedConsultorio.domicilio, true)}
                      {consultorioReadOnlyField("Número", selectedConsultorio.numeracion)}
                      {consultorioReadOnlyField("Municipio / localidad", selectedConsultorio.ciudad)}
                      {consultorioReadOnlyField("Código postal", record.codigoPostal)}
                      {consultorioReadOnlyField("Teléfono", record.telefono)}
                      {consultorioReadOnlyField("Celular", record.celular)}
                      {consultorioReadOnlyField("Mail de Gmail", record.email, true)}
                      {consultorioReadOnlyField("Inicio de actividad", selectedConsultorio.fechaInicioConsultorio || record.fechaInicioConsultorio)}
                    </div>
                  )}
                </div>
              )}
              {["puertasIngresoAdaptadas", "puertasInternasAdaptadas", "rampas", "escaleras", "escalerasPasamanos", "ascensor", "instalacionElectrica", "descargaTierra", "sistemaTrifasico", "disyuntor", "alarmaHumo", "salidaEmergencia", "aireConsultorio", "ventilacionPasivaConsultorio", "ventilacionForzadaConsultorio", "boxes"].map((key) =>
                select(CONSULTORIO_FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1"), key),
              )}
              {input("Superficie aproximada (m²)", "superficieMetros", "number")}
              {input("Capacidad aproximada de atención simultánea", "capacidadPacientes", "number")}
              {input("Cantidad de boxes o gabinetes", "cantidadBoxes", "number", data.boxes === "SI")}
              {input("Cantidad de camillas instaladas", "cantidadCamillas", "number")}
              {text("Equipamiento: aparatología en buen estado de uso", "equipamientoConsultorio")}
            </>,
            "Seleccione Sí o No según corresponda.",
          )}
        {step === 3 &&
          section(
            "SALA DE ESPERA",
            <>
              {["aireEspera", "ventilacionPasivaEspera", "ventilacionForzadaEspera", "bano", "inodoro", "lavatorio", "aguaCaliente", "ducha", "banoAdaptado", "gimnasioTerapeutico", "gimnasioDeportivo"].map((key) =>
                select(CONSULTORIO_FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1"), key),
              )}
              {data.gimnasioTerapeutico === "SI" && (
                <>
                  {input("Capacidad de atención simultánea (gimnasio terapéutico)", "capacidadGimnasioTerapeutico", "number", true)}
                  {text("Anexo I: equipamiento de gimnasio terapéutico", "anexoI", true)}
                </>
              )}
              {data.gimnasioDeportivo === "SI" && (
                <>
                  {input("Capacidad de atención simultánea (gimnasio deportivo)", "capacidadGimnasioDeportivo", "number", true)}
                  {text("Anexo II: equipamiento de gimnasio deportivo", "anexoII", true)}
                </>
              )}
            </>,
          )}        {hasProfesionalAdjunto &&
          step >= adjuntoStep && step < documentsStep &&
          renderAdjuntoDeclaracion(step - adjuntoStep + 1)}
        {step === documentsStep && (
          <>
            <section>
              <h2>ADJUNTAR DATOS OBLIGATORIOS</h2>
              {requiredDocumentsBlock}
            </section>
            <aside className="cokifimi-consultorio-legal">
              <strong>Documentación requerida</strong>
              <p>
                El profesional debe presentar constancias de la inscripción
                requerida obligatoriamente para poder obtener el Alta.
              </p>
            </aside>
            <label className="cokifimi-consultorio-check">
              <span className="cokifimi-consultorio-check-row">
                <input
                  type="checkbox"
                  required

                  checked={Boolean(data.declaraVeracidad)}
                  onChange={(e) => set("declaraVeracidad", e.target.checked)}
                  aria-label="Acepto la declaración de veracidad"
                />
                <span>
                  Declaro que los datos informados son veraces y me comprometo a
                  cumplir las normas vigentes.
                </span>
              </span>
              {!data.declaraVeracidad && (
                <small className="cokifimi-consultorio-check-alert">
                  Debe aceptar la declaración para continuar.
                </small>
              )}
            </label>
          </>
        )}
        <footer className="cokifimi-consultorio-actions">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              <ChevronLeft /> Anterior
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const form = formRef.current;
              if (!form) return;
              void submit({ preventDefault: () => undefined, currentTarget: form } as unknown as FormEvent);
            }}
          >
            {step === documentsStep ? (
              <>
                <Eye /> {adminEdit ? "Previsualizar alta" : "Revisar antes de presentar"}
              </>
            ) : (
              <>
                Siguiente <ChevronRight />
              </>
            )}
          </button>
        </footer>
      </form>
    </section>
  );
}

const formatLabel = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .replace(/Anssal/g, "ANSSAL")
    .replace(/Dni/g, "DNI")
    .replace(/Cuil/g, "CUIL");

const formatValue = (value: string | boolean | undefined) => {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || ""))
    return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
  return value || "—";
};

function PreviewPage({
  number,
  title,
  children,
  photoUrl,
  showFooter = false,
}: {
  number: number;
  title: string;
  children: ReactNode;
  photoUrl?: string;
  showFooter?: boolean;
}) {
  return (
    <section className={`cokifimi-consultorio-print-page ${showFooter ? "is-adjuntos-overflow" : ""}`}>
      <img
        className="cokifimi-consultorio-watermark"
        src={cokifimiLogo}
        alt=""
        aria-hidden="true"
      />
      <header>
        <div className="cokifimi-consultorio-print-brand">
          <ClipboardCheck />
          <span>COLEGIO DE KINESIOLOGOS Y FISIOTERAPEUTAS DE MISIONES</span>
        </div>
        {photoUrl && (
          <img
            className="cokifimi-consultorio-print-photo"
            src={photoUrl}
            alt="Foto del colegiado"
          />
        )}
        <small>
          Habilitación de Consultorio / Área Kinésica ·
          Hoja {number}
        </small>
      </header>
      <h2>Habilitación de consultorio / Área kinésica</h2>
      <h3>{title}</h3>
      {children}
      <footer>
        Vista previa de la solicitud · Habilitación de Consultorio / Área Kinésica
      </footer>
    </section>
  );
}

export function ConsultorioHabilitacionPreview({
  data,
  onEdit,
  onConfirm,
  onCancel,
  onOpenResolution,
  onPaymentSubmit,
  saving,
  isPendingSave = true,
  backLabel = "Volver al panel",
}: {
  data: DeclarationData;
  onEdit?: () => void;
  onConfirm?: () => void;
  onCancel: () => void;
  onOpenResolution?: () => void;
  onPaymentSubmit?: (file: string, name: string) => void;
  saving: boolean;
  isPendingSave?: boolean;
  backLabel?: string;
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // La vista previa debe mostrar únicamente los adjuntos de la solicitud actual.
  // No se mezclan archivos guardados localmente de una carga anterior.
  const values: ConsultorioFormValues = {
    ...(data.formularioHabilitacionConsultorio || {}),
    apellido: data.apellido,
    nombres: data.nombres,
    dni: data.dni,
    cuilCuit: data.cuilCuit,
    matricula: data.matricula,
  };
  const getDocumentValue = (key: string) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const readFile = (value: unknown): string => {
      if (typeof value === 'string') {
        const text = value.trim();
        return /^(data:|https?:\/\/|blob:)/i.test(text) ? text : '';
      }
      if (!value || typeof value !== 'object') return '';
      const object = value as Record<string, unknown>;
      for (const candidate of ['url', 'downloadUrl', 'src', 'file', 'data', 'base64']) {
        const found = readFile(object[candidate]);
        if (found) return found;
      }
      return '';
    };
    const visited = new Set<object>();
    const find = (value: unknown): string => {
      if (!value || typeof value !== 'object') return '';
      if (visited.has(value as object)) return '';
      visited.add(value as object);
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = find(item);
          if (found) return found;
        }
        return '';
      }
      const record = value as Record<string, unknown>;
      for (const [recordKey, recordValue] of Object.entries(record)) {
        const normalizedRecordKey = recordKey.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedRecordKey === normalizedKey || normalizedRecordKey === `${normalizedKey}url` || normalizedRecordKey === `${normalizedKey}base64`) {
          const direct = readFile(recordValue);
          if (direct) return direct;
        }
      }
      for (const child of Object.values(record)) {
        const found = find(child);
        if (found) return found;
      }
      return '';
    };
    return find(data);
  };  // También contemplar asociaciones agregadas posteriormente desde el panel del titular.
  const adjuntosPreview = Array.from({ length: 8 }, (_, index) => index + 1)
    .filter((ordinal) => Boolean(String(values[`adjuntoMatricula${ordinal > 1 ? ordinal : ""}`] || "").trim()));
    const getAdjuntoPhoto = (ordinal: number) => {
    const suffix = ordinal > 1 ? String(ordinal) : "";
    const configured = String(values[`adjuntoFotoUrl${suffix}`] || "").trim();
    if (configured) return configured;
    const matricula = String(values[`adjuntoMatricula${suffix}`] || "").replace(/\D/g, "");
    if (!matricula) return "";
    try {
      const stored = JSON.parse(localStorage.getItem("cokifimi_declarations") || "[]") as Array<Record<string, unknown>>;
      const match = stored.find((candidate) => String(candidate.matricula || "").replace(/\D/g, "") === matricula);
      if (!match) return "";
      return String(match.fotoUrl || localStorage.getItem(`cokifimi_declaration_photo_${match.id}`) || "");
    } catch {
      return "";
    }
  };
  const [attachmentPreview, setAttachmentPreview] = useState<{ file: string; label: string } | null>(null);
  const adminStatus =
    data.formularioHabilitacionConsultorio?.estadoAdmin === "APROBADO" ||
    data.formularioHabilitacionConsultorio?.validadoAdmin === true
      ? "approved"
      : data.formularioHabilitacionConsultorio?.estadoAdmin === "RECHAZADO"
        ? "rejected"
        : "pending";
  const statusLabel =
    adminStatus === "approved"
      ? "Solicitud aprobada"
      : adminStatus === "rejected"
        ? "Solicitud rechazada"
        : "Solicitud pendiente de validación";
  const certificateData = useMemo(() => {
    const form = data.formularioHabilitacionConsultorio || {};
    if (adminStatus !== "approved") return form;
    const hasConsultorio = typeof form.certificadoUrl === "string" && form.certificadoUrl.trim().length > 0;
    const hasEtica = typeof form.certificadoEticaUrl === "string" && form.certificadoEticaUrl.trim().length > 0;
    if (hasConsultorio && hasEtica) return form;
    const generated = generateAutomaticCertificates(data);
    return {
      ...form,
      certificadoNombre: form.certificadoNombre || generated.consultorioNombre,
      certificadoUrl: hasConsultorio ? form.certificadoUrl : generated.consultorioUrl,
      certificadoConsultorioNombre: form.certificadoConsultorioNombre || generated.consultorioNombre,
      certificadoConsultorioUrl: form.certificadoConsultorioUrl || generated.consultorioUrl,
      certificadoEticaNombre: form.certificadoEticaNombre || generated.eticaNombre,
      certificadoEticaUrl: hasEtica ? form.certificadoEticaUrl : generated.eticaUrl,
      certificadoVigenciaDesde: form.certificadoVigenciaDesde || generated.vigenciaDesde,
      certificadoVigenciaHasta: form.certificadoVigenciaHasta || generated.vigenciaHasta,
    };
  }, [adminStatus, data]);
  const field = (label: string, key: string, wide = false) => (
    <div className={wide ? "wide" : ""}>
      <span>{label}</span>
      <strong>{formatValue(values[key])}</strong>
    </div>
  );
  const section = (title: string, fields: ReactNode) => (
    <div className="cokifimi-consultorio-print-section">
      <h4>{title}</h4>
      <div className="cokifimi-consultorio-print-fields">{fields}</div>
    </div>
  );
  const downloadPdf = () => {
    const source = document.querySelector<HTMLElement>(
      "#consultorio-preview-container .cokifimi-consultorio-print-wrapper",
    );
    if (!source) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=1600");
    if (!printWindow) {
      window.print();
      return;
    }

    const styles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'),
    )
      .map((node) => node.outerHTML)
      .join("\n");

    const printDocument =
      "<!doctype html><html lang='es'><head><meta charset='UTF-8' />" +
      "<meta name='viewport' content='width=device-width, initial-scale=1.0' />" +
      "<title>Habilitaci?n de consultorio</title>" +
      styles +
      "<style>" +
      "@page { size: A4 portrait; margin: 0; }" +
      "html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
      "body { width: 210mm !important; }" +
      ".cokifimi-consultorio-preview-toolbar, .cokifimi-attachment-preview-modal, .cokifimi-preview-document-downloads { display: none !important; }" +
      ".cokifimi-consultorio-print-wrapper { display: block !important; margin: 0 !important; padding: 0 !important; width: 210mm !important; }" +
      ".cokifimi-consultorio-print-page { box-sizing: border-box !important; display: flex !important; flex-direction: column !important; width: 210mm !important; height: 297mm !important; min-height: 297mm !important; margin: 0 !important; padding: 9mm 11mm 7mm !important; overflow: hidden !important; background: #fff !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; break-after: page !important; page-break-after: always !important; }" +
      ".cokifimi-consultorio-print-page:last-child { height: auto !important; min-height: 297mm !important; overflow: visible !important; break-after: auto !important; page-break-after: auto !important; }" +
      ".cokifimi-consultorio-print-page > footer { display: block !important; }" +
      ".cokifimi-consultorio-print-fields { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }" +
      ".cokifimi-consultorio-print-fields > div { min-height: 38px !important; }" +
      "</style></head><body>" +
      source.outerHTML +
      "</body></html>";

    printWindow.document.open();
    printWindow.document.write(printDocument);
    printWindow.document.close();

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Chrome necesita mantener abierta la ventana mientras se guarda o cancela el PDF.
    }, 500);
  };  useEffect(() => {
    if (backLabel === "Volver a solicitudes") return;
    const container = document.querySelector<HTMLElement>(
      "#consultorio-preview-container",
    );
    const pages = container?.querySelectorAll<HTMLElement>(
      ".cokifimi-consultorio-print-page",
    );
    if (!container || !pages) return;
    const actionBar = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".cokifimi-consultorio-preview-toolbar > div",
      ),
    ).find((element) =>
      Array.from(element.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Descargar"),
      ),
    ) || container.querySelector<HTMLElement>(".cokifimi-consultorio-preview-toolbar > div:last-child");
    if (
      actionBar &&
      !actionBar.querySelector(".cokifimi-preview-document-downloads")
    ) {
      const downloads = document.createElement("div");
      downloads.className = "cokifimi-preview-document-downloads";
      const heading = document.createElement("strong");
      heading.textContent = "Certificados adjuntos";
      downloads.appendChild(heading);
      const attachmentsBase = [
        ["certificadoAnssalArchivo", "Certificado ANSSAL"],
    ["certificadoAnssalUrl", "Certificado ANSSAL"],
        ["polizaPraxisArchivo", "Póliza de praxis"],
        ["planoMunicipalArchivo", "Plano municipal"],
    ["planoMunicipalUrl", "Plano municipal"],
        ["certificadoBomberosArchivo", "Certificado de bomberos"],
    ["certificadoBomberosUrl", "Certificado de bomberos"],
        ["comprobantePagoArchivo", "Comprobante de pago"],
    ["comprobantePagoUrl", "Comprobante de pago"],
      ] as const;
      const attachments: Array<[string, string]> = Array.from(
        attachmentsBase,
        (x) => [String(x[0]), String(x[1])],
      );
      // Añadir adjuntos de los profesionales adjuntos (si existen)
      if (adjuntosPreview && adjuntosPreview.length) {
        adjuntosPreview.forEach((ordinal) => {
          const suffix = ordinal > 1 ? String(ordinal) : "";
          attachments.push([
            `certificadoAnssalArchivoAdjunto${suffix}`,
            `Certificado ANSSAL (adjunto ${ordinal})`,
          ]);
          attachments.push([
            `polizaPraxisArchivoAdjunto${suffix}`,
            `Póliza de praxis (adjunto ${ordinal})`,
          ]);
        });
      }
      const storageKey = `cokifimi_consultorio_adjuntos_${(data as any).id}`;
      const storedAttachments: Record<string, any> = JSON.parse(
        localStorage.getItem(storageKey) || "{}",
      );
      attachments.forEach(([key, label]) => {
        const file = (values as any)[key] || (data as any)[key] || storedAttachments[key];
        if (typeof file !== "string" || !file.trim()) return;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Ver ${label}`;
        button.style.setProperty("background", "#fff", "important");
        button.style.setProperty("border", "1px solid #fff", "important");
        button.style.setProperty(
          "box-shadow",
          "0 8px 18px rgb(2 44 34 / .18)",
          "important",
        );
        button.style.setProperty("color", "#0f5a3e", "important");
        button.addEventListener("click", () => {
          const modal = document.createElement("dialog");
          modal.className = "cokifimi-attachment-preview-modal";          modal.setAttribute("role", "dialog");
          modal.setAttribute("aria-modal", "true");
          modal.style.setProperty("position", "fixed", "important");
          modal.style.setProperty("inset", "0", "important");
          modal.style.setProperty("z-index", "2147483647", "important");
          modal.style.setProperty("isolation", "isolate", "important");
          const card = document.createElement("div");
          card.className = "cokifimi-attachment-preview-card";          card.style.setProperty("position", "relative", "important");
          card.style.setProperty("z-index", "2147483647", "important");
          card.style.setProperty("height", "calc(100vh - 32px)", "important");
          card.style.setProperty("max-height", "calc(100vh - 32px)", "important");
          const header = document.createElement("header");
          header.innerHTML = `<strong>${label}</strong><span class="cokifimi-attachment-preview-actions"><a href="${file}" download aria-label="Descargar ${label}">Descargar</a><button type="button" aria-label="Cerrar">Cerrar</button></span>`;
          const close = header.querySelector("button");
          close?.addEventListener("click", () => modal.remove());
          card.appendChild(header);
          if (file.startsWith("data:image/")) {
            const image = document.createElement("img");
            image.src = file;
            image.alt = label;
            card.appendChild(image);
          } else {
            const frame = document.createElement("iframe");
            frame.src = file;
            frame.title = label;
            card.appendChild(frame);
          }
          modal.appendChild(card);
          modal.addEventListener("click", (event) => {
            if (event.target === modal) modal.remove();
          });
          document.body.appendChild(modal);
          modal.showModal();
        });
        downloads.appendChild(button);
      });
      if (downloads.children.length > 1) actionBar.appendChild(downloads);
    }
  }, []);
  const attachmentCandidates: Array<[string, string]> = [
    ["certificadoAnssalArchivo", "Certificado ANSSAL"],
    ["certificadoAnssalUrl", "Certificado ANSSAL"],
    ["polizaPraxisArchivo", "Póliza de praxis"],
    ["planoMunicipalArchivo", "Plano municipal"],
    ["planoMunicipalUrl", "Plano municipal"],
    ["certificadoBomberosArchivo", "Certificado de bomberos"],
    ["certificadoBomberosUrl", "Certificado de bomberos"],
    ["comprobantePagoArchivo", "Comprobante de pago"],
    ["comprobantePagoUrl", "Comprobante de pago"],
    ["certificadoAnssalArchivoAdjunto", "Certificado ANSSAL · adjunto 1"],
    ["polizaPraxisArchivoAdjunto", "Póliza de praxis · adjunto 1"],
    ["certificadoAnssalArchivoAdjunto2", "Certificado ANSSAL · adjunto 2"],
    ["polizaPraxisArchivoAdjunto2", "Póliza de praxis · adjunto 2"],
  ];
  const headerAttachments = attachmentCandidates
    .map(([key, label]) => [getDocumentValue(String(key)), label] as [string, string])
    .filter(([file]) => Boolean(file.trim()));
  return (
    <div
      className="cokifimi-preview-modal max-w-6xl mx-auto space-y-8"
      id="consultorio-preview-container"
    >
      <div className="cokifimi-consultorio-preview-toolbar bg-gradient-to-r from-emerald-950 via-[#0F5A3E] to-emerald-900 rounded-3xl shadow-[0_12px_36px_rgba(15,90,62,0.14)] border border-emerald-900/15 p-3 md:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div className="cokifimi-consultorio-preview-identity flex items-center gap-3">
          <div className="cokifimi-consultorio-preview-avatar">
            {data.fotoUrl ? (
              <img
                src={data.fotoUrl}
                alt={`Foto de ${data.apellido}, ${data.nombres}`}
              />
            ) : (
              <UserRound />
            )}
          </div>
          <div className="text-white">
            <h2 className="text-lg md:text-xl font-black mt-0 leading-tight">
              Habilitación de consultorio / Área kinésica
            </h2>
            <p className="text-emerald-50/80 text-sm mt-1">
              {data.apellido}, {data.nombres} · M.P. {data.matricula}
            </p>
            <p className="text-emerald-50/80 text-sm mt-1">
          La solicitud se presenta en las 3 hojas que ve a continuación.
            </p>
            <div className="cokifimi-consultorio-preview-status-row">
              <div
                className={`cokifimi-consultorio-preview-status is-${adminStatus}`}
              >
                {adminStatus === "approved" ? (
                  <CheckCircle2 />
                ) : adminStatus === "rejected" ? (
                  <XCircle />
                ) : (
                  <Clock3 />
                )}
                <span>{statusLabel}</span>
              </div>
              {!isPendingSave && adminStatus === "approved" && (
                <div className="cokifimi-consultorio-certificate-actions">
                  {certificateData.certificadoUrl && (
                    <a href={String(certificateData.certificadoUrl || "")} download={String(certificateData.certificadoNombre || "certificado-consultorio")} className="cokifimi-consultorio-certificate-download">
                      <Download className="w-4 h-4" /> Certificado de habilitación
                    </a>
                  )}
                  {certificateData.certificadoEticaUrl && (
                    <a href={String(certificateData.certificadoEticaUrl || "")} download={String(certificateData.certificadoEticaNombre || "certificado-etica-libre-deuda")} className="cokifimi-consultorio-certificate-download">
                      <Download className="w-4 h-4" /> Certificado de ética / libre deuda
                    </a>
                  )}
                </div>
              )}
            </div>
            {isPendingSave && (
              <p className="mt-3 inline-flex rounded-lg bg-amber-300/20 px-3 py-2 text-xs font-bold text-amber-100">
                Revisá todos los datos antes de guardar. Cuando esté correcto,
                presioná “Guardar solicitud”.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          {!isPendingSave && headerAttachments.length > 0 && (
            <div className="cokifimi-preview-document-downloads" aria-label="Certificados adjuntos">
              <strong>Certificados adjuntos</strong>
              {headerAttachments.map(([file, label]) => (
                <span key={label} className="cokifimi-preview-attachment-link">
                  <a href={file} onClick={(event) => { event.preventDefault(); setAttachmentPreview({ file, label }); }} title={`Ver ${label}`}>Ver {label}</a>
                  <a href={file} download title={`Descargar ${label}`} aria-label={`Descargar ${label}`}><Download /></a>
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none backdrop-blur"
          >
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </button>
          {!isPendingSave && (
            <button
              type="button"
              onClick={() => void downloadPdf()}
              className="border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none backdrop-blur"
            >
              <Download className="w-4 h-4" /> Imprimir / guardar PDF
            </button>
          )}
          {isPendingSave && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none backdrop-blur"
            >
              <Edit className="w-4 h-4" /> Editar formulario
            </button>
          )}
          {isPendingSave && onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="bg-white hover:bg-emerald-50 text-[#0F5A3E] font-bold text-sm px-5 py-3 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/15 focus:outline-none ring-2 ring-white/40"
            >
              <Save className="w-4 h-4" />{" "}
              {saving ? "Guardando..." : "Guardar solicitud"}
            </button>
          )}
        </div>
        {!isPendingSave && backLabel === "Volver a solicitudes" && (
          <button
            type="button"
            onClick={() => {
              onOpenResolution?.();
            }}
            className="cokifimi-consultorio-resolution-launcher"
          >
            <ClipboardCheck /> Resolver solicitud
          </button>
        )}
      </div>
      <div className="cokifimi-consultorio-print-wrapper">
        <PreviewPage
          number={1}
          title="I. Datos del profesional titular responsable"
          photoUrl={data.fotoUrl}
        >
          {section(
            "Datos personales y profesionales",
            <>
              {field("Apellidos", "apellido", true)}
              {field("Nombres", "nombres", true)}
              {field("DNI", "dni")}
              {field("CUIL / CUIT", "cuilCuit")}
              {field("Matrícula provincial", "matricula")}
              {field("Ciudad", "ciudadDeclaracion")}
              {/* Alta / renovación ya no se declara: el formulario es siempre alta. */}
            </>,
          )}
          {section(
            "Condición profesional",
            <>
              {field("Tipo de área kinésica", "tipoArea", true)}
              {field("Atiende por obras sociales", "atiendeObrasSociales")}
              {field(
                "Asociado/a a la Asociación de Kinesiólogos",
                "asociadoAsociacion",
                true,
              )}
              {field("Posee certificado ANSSAL", "poseeAnssal")}
              {field("ANSSAL desde", "anssalDesde")}
              {field("ANSSAL hasta", "anssalHasta")}
            </>,
          )}
          {section(
            "Seguro de praxis médica",
            <>
              {field("Compañía de seguro", "companiaSeguro", true)}
              {field("Número de póliza", "polizaSeguro")}
              {field("Vigente desde", "seguroDesde")}
              {field("Vigente hasta", "seguroHasta")}
            </>,
          )}
        </PreviewPage>
        <PreviewPage
          number={2}
          title="II. Ubicación e instalaciones del consultorio"
        >
          {section(
            "Ubicación y contacto",
            <>
              {field("Dirección", "domicilioConsultorio", true)}
              {field("Número", "numeroConsultorio")}
              {field("Municipio / localidad", "localidadConsultorio")}
              {field("Código postal", "codigoPostalConsultorio")}
              {field("Teléfono", "telefonoConsultorio")}
              {field("Celular", "celularConsultorio")}
              {field("Mail de Gmail", "mailConsultorio", true)}
              {field("Inicio de actividad", "fechaInicioActividad")}
            </>,
          )}
          {section(
            "Accesibilidad e instalaciones",
            <>
              <div className="wide cokifimi-consultorio-print-prohibition">
                <strong>PRÁCTICA ESTUDIANTE ESTÁ PROHIBIDO</strong>
              </div>
              {field("Puertas de ingreso adaptadas", "puertasIngresoAdaptadas")}
              {field("Puertas internas adaptadas", "puertasInternasAdaptadas")}
              {field("Rampas", "rampas")}
              {field("Escaleras", "escaleras")}
              {field("Escaleras con pasamanos", "escalerasPasamanos")}
              {field("Ascensor", "ascensor")}
              {field(
                CONSULTORIO_FIELD_LABELS.instalacionElectrica,
                "instalacionElectrica",
              )}
              {field("Descarga a tierra", "descargaTierra")}
              
              {field(
                CONSULTORIO_FIELD_LABELS.sistemaTrifasico,
                "sistemaTrifasico",
              )}
              {field("Disyuntor", "disyuntor")}
              {field("Alarma de humo", "alarmaHumo")}
              {field("Salida de emergencia", "salidaEmergencia")}
            </>,
          )}
        </PreviewPage>
        <PreviewPage number={3} title="III. Consultorio y sala de espera" photoUrl={adjuntosPreview.length > 4 ? data.fotoUrl : undefined} showFooter={adjuntosPreview.length > 4}>
          {section(
            "Consultorio",
            <>
              {field("Aire acondicionado", "aireConsultorio")}
              {field(CONSULTORIO_FIELD_LABELS.ventilacionPasivaConsultorio, "ventilacionPasivaConsultorio")}
              {field(CONSULTORIO_FIELD_LABELS.ventilacionForzadaConsultorio, "ventilacionForzadaConsultorio")}
              {field("Boxes o gabinetes", "boxes")}
              {field("Superficie aproximada (m²)", "superficieMetros")}
              {field("Capacidad de atención simultánea", "capacidadPacientes")}
              {field("Cantidad de boxes o gabinetes", "cantidadBoxes")}
              {field("Cantidad de camillas instaladas", "cantidadCamillas")}
              {field(
                "Equipamiento y aparatología",
                "equipamientoConsultorio",
                true,
              )}
            </>,
          )}
          {section(
            "Sala de espera y sanitarios",
            <>
              {field("Aire acondicionado", "aireEspera")}
              {field(CONSULTORIO_FIELD_LABELS.ventilacionPasivaEspera, "ventilacionPasivaEspera")}
              {field(CONSULTORIO_FIELD_LABELS.ventilacionForzadaEspera, "ventilacionForzadaEspera")}
              {field("Baño", "bano")}
              {field("Inodoro", "inodoro")}
              {field("Lavatorio", "lavatorio")}
              {field("Agua caliente", "aguaCaliente")}
              {field(CONSULTORIO_FIELD_LABELS.ducha, "ducha")}
              {field(CONSULTORIO_FIELD_LABELS.banoAdaptado, "banoAdaptado")}
            </>,
          )}
        </PreviewPage>
        <PreviewPage
          number={4}
          title="IV. Gimnasio terapéutico y profesional adjunto"
        >
          {section(
            "Gimnasio terapéutico / deportivo",
            <>
              {field("Gimnasio terapéutico", "gimnasioTerapeutico")}
              {String(values.gimnasioTerapeutico || "") === "SI" && (
                <>
                  {field("Capacidad de gimnasio terapéutico", "capacidadGimnasioTerapeutico")}
                  {field("Anexo I: equipamiento de gimnasio terapéutico", "anexoI", true)}
                </>
              )}
              {field("Gimnasio deportivo", "gimnasioDeportivo")}
              {String(values.gimnasioDeportivo || "") === "SI" && (
                <>
                  {field("Capacidad de gimnasio deportivo", "capacidadGimnasioDeportivo")}
                  {field("Anexo II: equipamiento de gimnasio deportivo", "anexoII", true)}
                </>
              )}
            </>,
          )}
          {adjuntosPreview.slice(0, 0).map((ordinal) => {
            const key = (name: string) => (ordinal > 1 ? `${name}${ordinal}` : name);
            const titulo =
              adjuntosPreview.length > 1
                ? `Declaración jurada del profesional adjunto ${ordinal} a la Habilitación de Consultorio/Área Kinésica`
                : "Declaración jurada del profesional adjunto a la Habilitación de Consultorio/Área Kinésica";
            return (
              <div key={`adjunto-${ordinal}`} className={adjuntosPreview.length === 1 ? "cokifimi-adjunto-preview-single" : ""}>
                {/* Removed long instructional paragraph as requested */}
                {section(
                  titulo,
                  <>
                    <div className="cokifimi-adjunto-subtitle" style={{ marginBottom: '0.25rem' }}>
                      <strong>Datos del profesional adjunto</strong>
                      {getAdjuntoPhoto(ordinal) && (
                        <img
                          src={getAdjuntoPhoto(ordinal)}
                          alt="Foto del profesional adjunto"
                          className="cokifimi-adjunto-preview-photo"
                        />
                      )}
                    </div>
                    <div>
                      <span>Fecha de solicitud</span>
                      <strong>{formatValue(today())}</strong>
                    </div>
                    {field("Título universitario", key("adjuntoTitulo"))}
                    {field("Apellidos", key("adjuntoApellido"))}
                    {field("Nombres", key("adjuntoNombres"))}
                    {field("DNI", key("adjuntoDni"))}
                    {field("CUIL / CUIT", key("adjuntoCuil"))}
                    {field("Matrícula provincial", key("adjuntoMatricula"))}
                    {field(
                      "Atiende por obras sociales",
                      key("adjuntoObrasSociales"),
                    )}
                    {field(
                      "Asociado/a a la Asociación de Kinesiólogos",
                      key("adjuntoAsociado"),
                      true,
                    )}
                    {field("ANSSAL desde", key("adjuntoAnssalDesde"))}
                    {field("ANSSAL hasta", key("adjuntoAnssalHasta"))}
                    {field(
                      "Compañía de seguro de praxis médica",
                      key("adjuntoCompaniaSeguro"),
                      true,
                    )}
                    {field("Número de póliza", key("adjuntoPolizaSeguro"))}
                    {field("Póliza vigente desde", key("adjuntoSeguroDesde"))}
                    {field("Póliza vigente hasta", key("adjuntoSeguroHasta"))}
                    {field(
                      "Inicio de actividad en esta habilitación",
                      key("adjuntoInicioActividad"),
                    )}
                  </>,
                )}
              </div>
            );
          })}
          <p className="cokifimi-consultorio-print-declaration">
            Declaro que los datos informados son veraces y me comprometo a
            cumplir las normas vigentes.
          </p>
        </PreviewPage>
        {adjuntosPreview.map((ordinal) => (
          <PreviewPage key={ordinal} number={ordinal + 4} title="V. Profesionales adjuntos · continuación">
            {(() => {
              const key = (name: string) => (ordinal > 1 ? `${name}${ordinal}` : name);
                return section(`Declaración jurada del profesional adjunto ${ordinal} a la Habilitación de Consultorio/Área Kinésica`, <>                <div className="cokifimi-adjunto-subtitle" style={{ marginBottom: '0.25rem' }}>
                  <strong>Datos del profesional adjunto</strong>
                  {getAdjuntoPhoto(ordinal) && (
                    <img
                      src={getAdjuntoPhoto(ordinal)}
                      alt="Foto del profesional adjunto"
                      className="cokifimi-adjunto-preview-photo"
                    />
                  )}
                </div>
                {field("Título universitario", key("adjuntoTitulo"))}{field("Apellidos", key("adjuntoApellido"))}{field("Nombres", key("adjuntoNombres"))}{field("DNI", key("adjuntoDni"))}{field("CUIL / CUIT", key("adjuntoCuil"))}{field("Matrícula provincial", key("adjuntoMatricula"))}{field("Atiende por obras sociales", key("adjuntoObrasSociales"))}{field("Asociado/a a la Asociación de Kinesiólogos", key("adjuntoAsociado"), true)}{field("ANSSAL desde", key("adjuntoAnssalDesde"))}{field("ANSSAL hasta", key("adjuntoAnssalHasta"))}{field("Compañía de seguro de praxis médica", key("adjuntoCompaniaSeguro"), true)}{field("Número de póliza", key("adjuntoPolizaSeguro"))}{field("Póliza vigente desde", key("adjuntoSeguroDesde"))}{field("Póliza vigente hasta", key("adjuntoSeguroHasta"))}{field("Inicio de actividad en esta habilitación", key("adjuntoInicioActividad"))}
              </>);
            })()}
            <p className="cokifimi-consultorio-print-declaration">Declaro que los datos informados son veraces y me comprometo a cumplir las normas vigentes.</p>
          </PreviewPage>
        ))}
      </div>
      {attachmentPreview && createPortal((
        <div className="cokifimi-attachment-preview-modal" role="dialog" aria-modal="true" aria-label={attachmentPreview.label} onClick={() => setAttachmentPreview(null)}>
          <div className="cokifimi-attachment-preview-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{attachmentPreview.label}</strong>
              <span className="cokifimi-attachment-preview-actions">
                <a href={attachmentPreview.file} download>Descargar</a>
                <button type="button" onClick={() => setAttachmentPreview(null)}>Cerrar</button>
              </span>
            </header>
            {attachmentPreview.file.startsWith("data:image/") ? (
              <img src={attachmentPreview.file} alt={attachmentPreview.label} />
            ) : (
              <iframe src={attachmentPreview.file} title={attachmentPreview.label} />
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
