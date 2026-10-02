import express from "express";
import pool from "./db";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Database health check failed", error);
    response.status(503).json({ ok: false, database: "disconnected" });
  }
});

app.listen(port, () => {
  console.log(`Cokifimi standalone API listening on http://127.0.0.1:${port}`);
});