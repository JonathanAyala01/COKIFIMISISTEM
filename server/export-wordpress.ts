import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "dotenv/config";

type ExportedRecord = Record<string, unknown>;

const baseUrl = String(process.env.WP_BASE_URL || "").replace(/\/$/, "");
const username = process.env.WP_ADMIN_USER || "admincokifi";
const password = process.env.WP_ADMIN_PASSWORD || "";

if (!baseUrl || !password) {
  console.error("Configurá WP_BASE_URL y WP_ADMIN_PASSWORD en .env. No se guardan credenciales en el archivo de salida.");
  process.exit(1);
}

const loginResponse = await fetch(`${baseUrl}/wp-json/cokifimi/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});

if (!loginResponse.ok) {
  throw new Error(`WordPress rechazó el inicio de sesión (${loginResponse.status}).`);
}

const setCookie = loginResponse.headers.get("set-cookie");
if (!setCookie) throw new Error("WordPress no devolvió la cookie de sesión administrativa.");
const cookie = setCookie.split(";")[0];

const recordsResponse = await fetch(`${baseUrl}/wp-json/cokifimi/v1/records`, {
  headers: { cookie },
});
if (!recordsResponse.ok) {
  throw new Error(`No se pudieron leer los registros (${recordsResponse.status}).`);
}

const records = (await recordsResponse.json()) as ExportedRecord[];
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve("backups", `wordpress-records-${timestamp}.json`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ exportedAt: new Date().toISOString(), records }, null, 2), "utf8");

console.log(`Copia de lectura creada: ${output}`);
console.log(`Registros descargados: ${records.length}`);