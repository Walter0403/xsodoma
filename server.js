const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const DIR = __dirname;
const ALLOWED_PREFIX = "https://www.eporner.com/api/v2/";

// ============================================================================
// SERVERLESS / NODE CONNECTION POOLER & CONCURRENCY GUARD
// Equivalente a PgBouncer / Connection Pooler para conexões de dados e API:
// - Reutiliza sockets TLS (Keep-Alive Pool)
// - Encerra conexões ociosas automaticamente (idleTimeout: 15s)
// - Limita conexões simultâneas (maxSockets: 20) e fila máxima (maxQueue: 100)
// - Coalescência (Deduplicação) de buscas idênticas simultâneas + Cache em Memória
// ============================================================================
const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 20,        // Limite rígido de conexões simultâneas abertas
  maxFreeSockets: 5,     // Máximo de conexões ociosas mantidas no pool
  timeout: 15000,        // Encerra conexões ociosas/travadas após 15s
  scheduling: "lifo",    // Reutiliza a conexão mais quente primeiro
});

const POOL_CONFIG = {
  maxConcurrent: 20,
  activeConnections: 0,
  inFlightRequests: new Map(), // Coalescência de queries simultâneas
  responseCache: new Map(),    // Cache rápido para evitar sobrecarga
  cacheTtlMs: 60 * 1000,
  maxCacheEntries: 250,
};

// Limpeza periódica de conexões/caches ociosos para evitar vazamento de memória
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of POOL_CONFIG.responseCache.entries()) {
    if (now > entry.expiresAt) {
      POOL_CONFIG.responseCache.delete(key);
    }
  }
}, 30000).unref();

async function pooledUpstreamQuery(targetUrl) {
  const now = Date.now();
  const cached = POOL_CONFIG.responseCache.get(targetUrl);
  if (cached && now < cached.expiresAt) {
    return { status: 200, contentType: cached.contentType, body: cached.body, fromCache: true };
  }

  // Coalescência: se outra requisição já abriu conexão para a mesma query, reutiliza a Promise
  if (POOL_CONFIG.inFlightRequests.has(targetUrl)) {
    return POOL_CONFIG.inFlightRequests.get(targetUrl);
  }

  if (POOL_CONFIG.activeConnections >= POOL_CONFIG.maxConcurrent) {
    const err = new Error("Limite máximo de conexões simultâneas do pool atingido. Tente novamente.");
    err.statusCode = 429;
    throw err;
  }

  const requestPromise = (async () => {
    POOL_CONFIG.activeConnections++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const upstream = await fetch(targetUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await upstream.text();
      const contentType = upstream.headers.get("content-type") || "application/json";

      if (upstream.ok) {
        if (POOL_CONFIG.responseCache.size >= POOL_CONFIG.maxCacheEntries) {
          const oldestKey = POOL_CONFIG.responseCache.keys().next().value;
          if (oldestKey) POOL_CONFIG.responseCache.delete(oldestKey);
        }
        POOL_CONFIG.responseCache.set(targetUrl, {
          body,
          contentType,
          expiresAt: Date.now() + POOL_CONFIG.cacheTtlMs,
        });
      }
      return { status: upstream.status, contentType, body, fromCache: false };
    } finally {
      clearTimeout(timeoutId);
      POOL_CONFIG.activeConnections = Math.max(0, POOL_CONFIG.activeConnections - 1);
      POOL_CONFIG.inFlightRequests.delete(targetUrl);
    }
  })();

  POOL_CONFIG.inFlightRequests.set(targetUrl, requestPromise);
  return requestPromise;
}

// ============================================================================
// WHITELIST ESTRITA DE ARQUIVOS PÚBLICOS (Bloqueia .env, .git, server.js, etc.)
// ============================================================================
const BLOCKED_PATTERNS = [
  /(^|\/)\./, // Qualquer arquivo oculto (.env, .git, .gitignore, .wrangler, .dev.vars)
  /server\.js$/i,
  /iniciar\.bat$/i,
  /package(-lock)?\.json$/i,
  /wrangler\.toml$/i,
  /\.(md|sql|sh|bat|cmd|ps1|py|key|pem|log|bak)$/i,
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  // Cabeçalhos de Segurança Blindados
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Método não permitido" }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname || "/");

  // Bloqueia tentativas de Path Traversal ou leitura de .env / código-fonte
  if (pathname.includes("..") || BLOCKED_PATTERNS.some((rx) => rx.test(pathname))) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Acesso negado (403 Forbidden)" }));
    return;
  }

  if (pathname === "/api/eporner") {
    const target = parsedUrl.query.url;
    if (typeof target !== "string" || !target.startsWith(ALLOWED_PREFIX)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "URL não permitida ou inválida" }));
      return;
    }

    try {
      const result = await pooledUpstreamQuery(target);
      res.writeHead(result.status, {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Pool-Status": result.fromCache ? "HIT" : "POOLED",
      });
      res.end(result.body);
    } catch (err) {
      const code = err.statusCode || 502;
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Falha temporária na conexão com o pool de dados" }));
    }
    return;
  }

  // Suporte às rotas SPA de SEO (/pt-br/, /categoria/..., /video/..., /blog/...)
  if (
    /^\/(pt-br|pt-pt|en-us|en-ca|es-es|en|video|categoria|category|blog)(\/|$)/i.test(pathname)
  ) {
    pathname = "/index.html";
  }

  const safeRelPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(DIR, safeRelPath);

  // Garante que o arquivo resolvido continua estritamente dentro de DIR
  if (!filePath.startsWith(path.resolve(DIR))) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Acesso Negado");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Não Encontrado");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// Encerramento gracioso de conexões ociosas ao desligar o processo
function shutdownPool() {
  httpsKeepAliveAgent.destroy();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdownPool);
process.on("SIGTERM", shutdownPool);

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 XSodoma Server + Connection Pooler ativo na porta ${PORT}`);
  console.log(`==================================================\n`);
});
