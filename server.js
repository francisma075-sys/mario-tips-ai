// MÁRIO TIPS AI 3.0 — pesquisa alargada de clubes e seleções
// Node.js 18+. A chave API fica apenas no servidor: API_FOOTBALL_KEY.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.API_FOOTBALL_KEY || "";
const BASE = "https://v3.football.api-sports.io";
const cache = new Map();

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

async function apiGet(endpoint, ttlMs = 60000) {
  if (!KEY) {
    const e = new Error("A chave API_FOOTBALL_KEY ainda não foi configurada no servidor.");
    e.status = 503;
    throw e;
  }
  const key = endpoint;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.time < ttlMs) return cached.data;

  const response = await fetch(BASE + endpoint, {
    method: "GET",
    headers: { "x-apisports-key": KEY }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const e = new Error(data.message || `O fornecedor respondeu com HTTP ${response.status}.`);
    e.status = response.status;
    e.details = data.errors || data;
    throw e;
  }
  if (data.errors && Object.keys(data.errors).length) {
    const e = new Error("A API devolveu um aviso ou erro nos parâmetros.");
    e.status = 400;
    e.details = data.errors;
    throw e;
  }
  cache.set(key, { time: now, data });
  return data;
}

function queryFrom(url, allowed) {
  const p = new URLSearchParams();
  for (const name of allowed) {
    const value = url.searchParams.get(name);
    if (value !== null && value.trim() !== "") p.set(name, value.trim());
  }
  return p.toString();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, app: "MARIO TIPS AI 3.0" }));
  }

  try {
    if (url.pathname === "/api/fixtures") {
      const allowed = ["date", "from", "to", "league", "season", "team", "status", "live"];
      const qs = queryFrom(url, allowed);
      if (!qs) return send(res, 400, { error: "Indica uma data ou um filtro para pesquisar jogos." });
      const params = new URLSearchParams(qs);
      params.set("timezone", "Africa/Luanda");
      return send(res, 200, await apiGet("/fixtures?" + params.toString(), 45000));
    }

    if (url.pathname === "/api/teams") {
      const allowed = ["search", "name", "country", "league", "season"];
      const qs = queryFrom(url, allowed);
      if (!qs) return send(res, 400, { error: "Escreve pelo menos o nome de uma equipa ou seleção." });
      return send(res, 200, await apiGet("/teams?" + qs, 6 * 60 * 60 * 1000));
    }

    if (url.pathname === "/api/leagues") {
      const allowed = ["search", "name", "country", "season", "type", "current"];
      const qs = queryFrom(url, allowed);
      if (!qs) return send(res, 400, { error: "Indica o nome de uma competição ou país." });
      return send(res, 200, await apiGet("/leagues?" + qs, 6 * 60 * 60 * 1000));
    }

    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 3) return send(res, 400, { error: "A pesquisa universal precisa de pelo menos 3 caracteres." });
      const encoded = encodeURIComponent(q);
      const [teams, leagues] = await Promise.all([
        apiGet("/teams?search=" + encoded, 6 * 60 * 60 * 1000),
        apiGet("/leagues?search=" + encoded, 6 * 60 * 60 * 1000)
      ]);
      return send(res, 200, {
        query: q,
        teams: teams.response || [],
        leagues: leagues.response || []
      });
    }

    if (url.pathname === "/api/standings") {
      const qs = queryFrom(url, ["league", "season", "team"]);
      if (!qs) return send(res, 400, { error: "Indica o ID da competição e a época." });
      return send(res, 200, await apiGet("/standings?" + qs, 60 * 60 * 1000));
    }

    // Servir a aplicação web
    const requested = url.pathname === "/" ? "index.html" : path.basename(url.pathname);
    const filePath = path.join(__dirname, requested);
    if (!filePath.startsWith(__dirname + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      return res.end("Não encontrado");
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    return send(res, error.status || 502, {
      error: error.message || "Não foi possível consultar o fornecedor de futebol.",
      details: error.details || undefined
    });
  }
});

server.listen(PORT, () => console.log(`MÁRIO TIPS AI 3.0 ativo na porta ${PORT}`));
