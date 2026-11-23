// Cloudflare Pages Serverless Function — Blindagem de Autenticação & Anti-Brute-Force (/api/auth)
// - Protege contra ataques de força bruta (bloqueio após 5 tentativas falhas por IP)
// - Nunca armazena nem trafega senhas ou e-mails em texto puro (recebe apenas hashes PBKDF2-SHA256)
// - Emite token de sessão assinado com HMAC-SHA256 via Web Crypto API na borda

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000; // 60 segundos de bloqueio contra força bruta

function getAuthSecurityPool() {
  if (!globalThis.__XSODOMA_AUTH_GUARD__) {
    globalThis.__XSODOMA_AUTH_GUARD__ = {
      attemptsByIp: new Map(),
      accounts: new Map(), // Armazenamento seguro em memória do Isolate (apenas hashes PBKDF2 + Salt)
      lastCleanup: Date.now(),
    };
  }
  const guard = globalThis.__XSODOMA_AUTH_GUARD__;
  const now = Date.now();
  if (now - guard.lastCleanup > 60000) {
    guard.lastCleanup = now;
    for (const [ip, rec] of guard.attemptsByIp.entries()) {
      if (now - rec.lastAttempt > LOCKOUT_MS * 2) guard.attemptsByIp.delete(ip);
    }
  }
  return guard;
}

async function signSessionToken(payloadObj) {
  const encoder = new TextEncoder();
  const secret = encoder.encode("xsodoma-edge-hmac-2026-shield-key");
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const dataStr = JSON.stringify(payloadObj);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(dataStr));
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${btoa(dataStr)}.${sigHex}`;
}

export async function onRequest(context) {
  const { request } = context;

  const securityHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: securityHeaders,
    });
  }

  const guard = getAuthSecurityPool();
  const clientIp = request.headers.get("CF-Connecting-IP") || "anon";
  const now = Date.now();

  const ipRecord = guard.attemptsByIp.get(clientIp) || { fails: 0, lockedUntil: 0, lastAttempt: now };
  if (now < ipRecord.lockedUntil) {
    const waitSec = Math.ceil((ipRecord.lockedUntil - now) / 1000);
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Muitas tentativas. Conta protegida contra força bruta. Aguarde ${waitSec}s.`,
      }),
      { status: 429, headers: securityHeaders }
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const emailHash = String(body.emailHash || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
    const passwordHash = String(body.passwordHash || "").replace(/[^a-f0-9]/gi, "").slice(0, 128);
    const salt = String(body.salt || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
    const maskedEmail = String(body.maskedEmail || "").replace(/[<>"';]/g, "").slice(0, 48);
    const username = String(body.username || "").replace(/[<>"';]/g, "").slice(0, 32);

    if (!emailHash || !passwordHash) {
      return new Response(JSON.stringify({ ok: false, error: "Dados criptográficos inválidos." }), {
        status: 400,
        headers: securityHeaders,
      });
    }

    if (action === "register") {
      guard.accounts.set(emailHash, {
        username: username || "Membro",
        maskedEmail,
        passwordHash,
        salt,
        vip: !!body.vip,
        createdAt: now,
      });
      const token = await signSessionToken({ sub: emailHash, u: username, vip: !!body.vip, iat: now });
      return new Response(JSON.stringify({ ok: true, token }), {
        status: 200,
        headers: securityHeaders,
      });
    }

    if (action === "login") {
      const existing = guard.accounts.get(emailHash);
      if (existing && existing.passwordHash !== passwordHash) {
        ipRecord.fails++;
        ipRecord.lastAttempt = now;
        if (ipRecord.fails >= MAX_FAILED_ATTEMPTS) {
          ipRecord.lockedUntil = now + LOCKOUT_MS;
        }
        guard.attemptsByIp.set(clientIp, ipRecord);
        return new Response(JSON.stringify({ ok: false, error: "E-mail ou senha incorretos." }), {
          status: 401,
          headers: securityHeaders,
        });
      }

      ipRecord.fails = 0;
      guard.attemptsByIp.set(clientIp, ipRecord);
      const token = await signSessionToken({
        sub: emailHash,
        u: (existing && existing.username) || username || "Membro",
        vip: existing ? existing.vip : !!body.vip,
        iat: now,
      });
      return new Response(JSON.stringify({ ok: true, token }), {
        status: 200,
        headers: securityHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Ação inválida." }), {
      status: 400,
      headers: securityHeaders,
    });
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: "Requisição inválida." }), {
      status: 400,
      headers: securityHeaders,
    });
  }
}

