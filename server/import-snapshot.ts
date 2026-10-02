import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pool from "./db";

type SnapshotRecord = {
  id?: string;
  dni?: string;
  apellido?: string;
  nombres?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

function toMysqlDate(value: unknown): string {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function getRecords(input: unknown): SnapshotRecord[] {
  if (Array.isArray(input)) return input as SnapshotRecord[];
  if (input && typeof input === "object" && Array.isArray((input as { records?: unknown }).records)) {
    return (input as { records: SnapshotRecord[] }).records;
  }
  throw new Error("El snapshot debe ser un array de registros o un objeto { records: [...] }.");
}

const file = process.argv[2];
const apply = process.argv.includes("--apply");

if (!file) {
  console.error("Uso: npm run import:snapshot -- ./backups/records.json [--apply]");
  process.exit(1);
}

const source = path.resolve(file);
const raw = await fs.readFile(source, "utf8");
const records = getRecords(JSON.parse(raw));
const valid = records.filter((record) => String(record.id || "").trim() !== "");

console.log(`Snapshot: ${source}`);
console.log(`Registros encontrados: ${records.length}`);
console.log(`Registros con ID válido: ${valid.length}`);
console.log(`Modo: ${apply ? "APLICAR COPIA" : "SIMULACIÓN (sin cambios)"}`);

if (!apply) {
  console.log("No se modificó la base local. Agregá --apply para importar.");
  await pool.end();
  process.exit(0);
}

let copied = 0;
for (const record of valid) {
  const recordId = String(record.id).trim();
  const createdAt = toMysqlDate(record.createdAt);
  const updatedAt = toMysqlDate(record.updatedAt || record.createdAt);
  const payload = JSON.stringify(record);

  await pool.execute(
    `INSERT INTO records (record_id, dni, apellido, nombres, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       dni = IF(updated_at <= VALUES(updated_at), VALUES(dni), dni),
       apellido = IF(updated_at <= VALUES(updated_at), VALUES(apellido), apellido),
       nombres = IF(updated_at <= VALUES(updated_at), VALUES(nombres), nombres),
       payload = IF(updated_at <= VALUES(updated_at), VALUES(payload), payload),
       created_at = LEAST(created_at, VALUES(created_at)),
       updated_at = GREATEST(updated_at, VALUES(updated_at))`,
    [
      recordId,
      String(record.dni || ""),
      String(record.apellido || ""),
      String(record.nombres || ""),
      payload,
      createdAt,
      updatedAt,
    ],
  );
  copied += 1;
}

console.log(`Copia local completada: ${copied} registros procesados.`);
await pool.end();