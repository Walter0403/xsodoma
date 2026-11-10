// Cloudflare Pages Function — Proxy para a API Eporner v2 (/api/eporner?url=...)
const ALLOWED_PREFIX = "https://www.eporner.com/api/v2/";

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target || !target.startsWith(ALLOWED_PREFIX)) {
    return new Response(
      JSON.stringify({ error: "URL não permitida ou inválida" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const upstream = await fetch(target, {
      headers: { Accept: "application/json, text/plain, */*" },
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Falha ao consultar o servidor da Eporner",
        details: err.message,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
