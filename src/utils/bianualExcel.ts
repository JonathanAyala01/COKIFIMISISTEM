import { DeclarationData } from "../types";

const PRIVATE_ACCESS_FIELDS = new Set([
  "memberAccessTokenHash",
  "memberTokenFailedAttempts",
  "memberTokenBlocked",
  "memberEnabled",
  "memberProvisional",
]);

const flattenDeclaration = (declaration: DeclarationData) => {
  const result: Record<string, string> = {};
  const visit = (value: unknown, path: string) => {
    const field = path.split(/[.\[\]]/).filter(Boolean).at(-1) || "";
    if (PRIVATE_ACCESS_FIELDS.has(field)) return;
    if (value == null) {
      result[path] = "";
    } else if (typeof value === "string") {
      result[path] = value.startsWith("data:") ? "[Archivo adjunto; contenido binario omitido]" : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[path] = String(value);
    } else if (Array.isArray(value)) {
      if (value.length === 0) result[path] = "";
      else value.forEach((item, index) => visit(item, `${path}[${index + 1}]`));
    } else if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) result[path] = "";
      else entries.forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  Object.entries(declaration as unknown as Record<string, unknown>).forEach(([key, value]) => visit(value, key));
  return result;
};

const xmlEscape = (value: string) => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const columnTitle = (path: string) => path
  .replace(/\[(\d+)\]/g, " $1")
  .replace(/([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
  .replace(/[._]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const downloadBianualExcel = (declarations: DeclarationData[]) => {
  if (!declarations.length) return;
  const rows = declarations.map(flattenDeclaration);
  const allColumns = new Set(rows.flatMap((row) => Object.keys(row)));
  const firstColumns = ["matricula", "apellido", "nombres", "dni", "cuilCuit", "email", "celular", "fechaPresentacion", "fechaVencimiento"];
  const columns = [
    ...firstColumns.filter((column) => allColumns.has(column)),
    ...[...allColumns].filter((column) => !firstColumns.includes(column)).sort((a, b) => a.localeCompare(b, "es")),
  ];
  const cell = (value: string) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Declaraciones Bianuales"><Table><Row>${columns.map((column) => cell(columnTitle(column))).join("")}</Row>${rows.map((row) => `<Row>${columns.map((column) => cell(row[column] || "")).join("")}</Row>`).join("")}</Table></Worksheet></Workbook>`;
  const blob = new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fichas-bianuales-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
