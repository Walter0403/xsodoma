// Cloudflare Pages Function — Proxy Resiliente de Imagens / Thumbnails (/api/thumb?url=...)
const FALLBACK_THUMB = "https://static-ca-cdn.eporner.com/thumbs/static4/2/28/289/289/5_360.jpg";

export async function onRequest(context) {
  const { request } = context;

  const url = new URL(request.url);
  let target = url.searchParams.get("url") || "";

  // Desfaz duplo-encapsulamento de forma recursiva caso ocorra
  while (target.includes("/api/thumb") || target.includes("url=")) {
    const subMatch = target.match(/(?:url=|\/api\/thumb\?url=)(https?%3A%2F%2F[^\s&]+|https?:\/\/[^\s&]+)/i);
    if (subMatch) {
      target = decodeURIComponent(subMatch[1]);
    } else {
      break;
    }
  }

  // Se não houver alvo ou não for eporner, redireciona para thumbnail real do acervo
  if (!target || !target.includes("eporner.com")) {
    return Response.redirect(FALLBACK_THUMB, 302);
  }

  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    if (target.startsWith("//")) {
      target = "https:" + target;
    } else {
      target = "https://" + target.replace(/^https?:\/\//, "");
    }
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Referer": "https://www.eporner.com/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      cf: {
        cacheTtl: 604800, // 7 dias de cache no Edge da Cloudflare
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      // Se a imagem no upstream falhar (404/403), redireciona para thumbnail real em vez do favicon
      return Response.redirect(FALLBACK_THUMB, 302);
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const imageBytes = await upstream.arrayBuffer();

    return new Response(imageBytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (_) {
    return Response.redirect(FALLBACK_THUMB, 302);
  }
}
