import { onRequest as epornerHandler } from "./functions/api/eporner.js";
import { onRequest as thumbHandler } from "./functions/api/thumb.js";
import { onRequest as crmHandler } from "./functions/api/crm.js";
import { onRequest as trackHandler } from "./functions/api/crm/track.js";
import { onRequest as authHandler } from "./functions/api/auth.js";

let catalogMap = null;

async function getCatalogMap(env, request) {
  if (catalogMap && catalogMap.size) return catalogMap;
  try {
    const catalogUrl = new URL("/catalog.json", request.url).href;
    const res = await env.ASSETS.fetch(new Request(catalogUrl));
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr)) {
        catalogMap = new Map();
        for (const item of arr) {
          if (item && item.id) catalogMap.set(item.id, item);
        }
        return catalogMap;
      }
    }
  } catch (err) {
    console.error("Erro ao carregar catalogMap no worker:", err);
  }
  return new Map();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Rotas de API Edge
    if (pathname === "/api/eporner" || pathname.startsWith("/api/eporner/")) {
      return epornerHandler({ request, env, ctx });
    }
    if (pathname === "/api/thumb" || pathname.startsWith("/api/thumb/")) {
      return thumbHandler({ request, env, ctx });
    }
    if (pathname === "/api/crm/track" || pathname.startsWith("/api/crm/track/")) {
      return trackHandler({ request, env, ctx });
    }
    if (pathname === "/api/crm" || pathname.startsWith("/api/crm/")) {
      return crmHandler({ request, env, ctx });
    }
    if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
      return authHandler({ request, env, ctx });
    }

    // 2. Se for arquivo estático com extensão (.xml, .txt, .png, .js, .css, etc.), entrega direto dos assets
    const hasFileExtension = /\.[a-zA-Z0-9]{2,5}$/.test(pathname);
    if (hasFileExtension) {
      if (env && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Not Found", { status: 404 });
    }

    // 3. Todas as rotas de páginas (Home, /video/*, /categoria/*, /tag/*, /busca/*, /pt-br/*)
    // Server-Side Rendering (SSR) e SPA fallback garantindo HTTP 200 OK para o Googlebot e visitantes
    if (env && env.ASSETS) {
      try {
        let indexRes = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url).href));
        if (!indexRes.ok) {
          indexRes = await env.ASSETS.fetch(new Request(new URL("/", request.url).href));
        }

        if (indexRes.ok) {
          let html = await indexRes.text();

          // A) SEO Server-Side Rendering para páginas de Vídeo individual (/video/:id/:slug)
          const vMatch = pathname.match(/^\/video\/([a-zA-Z0-9_-]+)/);
          if (vMatch) {
            const videoId = vMatch[1];
            const map = await getCatalogMap(env, request);
            const video = map.get(videoId);
            if (video) {
              const cleanTitle = String(video.title || 'Vídeo Adulto').replace(/"/g, '&quot;');
              const pageTitle = `${cleanTitle} — Vídeo Grátis HD 4K | XSodoma`;
              const pageDesc = `Assistir ${cleanTitle} completo e grátis em HD 4K no XSodoma. ${video.views ? Number(video.views).toLocaleString('pt-BR') : '1.000+'} visualizações. Qualidade máxima sem travamentos.`;
              const canonicalUrl = `https://x-sodoma.com${pathname}`;
              const thumbUrl = (video.default_thumb && video.default_thumb.src) || 'https://x-sodoma.com/favicon.png';
              const durationSec = video.length_sec || 300;
              const durationIso = `PT${Math.floor(durationSec / 60)}M${durationSec % 60}S`;
              const embedUrl = `https://www.eporner.com/embed/${video.id}/`;
              const uploadDate = video.added ? `${video.added}T00:00:00Z` : '2026-11-01T00:00:00Z';

              html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`);
              html = html.replace(/<meta name="description" content="[\s\S]*?">/i, `<meta name="description" content="${pageDesc}">`);
              html = html.replace(/<link rel="canonical"[\s\S]*?>/i, `<link rel="canonical" id="canonicalLink" href="${canonicalUrl}">`);
              html = html.replace(/<meta property="og:title" content="[\s\S]*?">/i, `<meta property="og:title" content="${pageTitle}">`);
              html = html.replace(/<meta property="og:description" content="[\s\S]*?">/i, `<meta property="og:description" content="${pageDesc}">`);
              html = html.replace(/<meta property="og:image" content="[\s\S]*?">/i, `<meta property="og:image" content="${thumbUrl}">`);
              html = html.replace(/<meta property="og:url" content="[\s\S]*?">/i, `<meta property="og:url" content="${canonicalUrl}">`);
              html = html.replace(/<meta name="twitter:title" content="[\s\S]*?">/i, `<meta name="twitter:title" content="${pageTitle}">`);
              html = html.replace(/<meta name="twitter:description" content="[\s\S]*?">/i, `<meta name="twitter:description" content="${pageDesc}">`);
              html = html.replace(/<meta name="twitter:image" content="[\s\S]*?">/i, `<meta name="twitter:image" content="${thumbUrl}">`);

              const videoSchema = {
                "@context": "https://schema.org",
                "@type": "VideoObject",
                "name": cleanTitle,
                "description": pageDesc,
                "thumbnailUrl": [thumbUrl],
                "uploadDate": uploadDate,
                "duration": durationIso,
                "embedUrl": embedUrl,
                "contentUrl": canonicalUrl,
                "interactionStatistic": {
                  "@type": "InteractionCounter",
                  "interactionType": { "@type": "WatchAction" },
                  "userInteractionCount": video.views || 1500
                }
              };

              html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(videoSchema)}</script>\n</head>`);
            }
          }

          // B) SEO Server-Side Rendering para Categorias e Tags (/categoria/*, /tag/*, /busca/*)
          const tagMatch = pathname.match(/^\/(categoria|category|tag|busca|search)\/([^\/]+)/);
          if (tagMatch) {
            const rawTag = decodeURIComponent(tagMatch[2]).replace(/[-_+]/g, ' ');
            const capitalized = rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
            const catTitle = `${capitalized} — Vídeos Pornô Grátis HD 4K | XSodoma`;
            const catDesc = `Confira os melhores vídeos de ${capitalized} grátis no XSodoma. Mais de 4,5 milhões de vídeos em Full HD e 4K atualizados diariamente sem cadastro.`;
            const canonicalUrl = `https://x-sodoma.com${pathname}`;

            html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${catTitle}</title>`);
            html = html.replace(/<meta name="description" content="[\s\S]*?">/i, `<meta name="description" content="${catDesc}">`);
            html = html.replace(/<link rel="canonical"[\s\S]*?>/i, `<link rel="canonical" id="canonicalLink" href="${canonicalUrl}">`);
            html = html.replace(/<meta property="og:title" content="[\s\S]*?">/i, `<meta property="og:title" content="${catTitle}">`);
            html = html.replace(/<meta property="og:description" content="[\s\S]*?">/i, `<meta property="og:description" content="${catDesc}">`);
            html = html.replace(/<meta property="og:url" content="[\s\S]*?">/i, `<meta property="og:url" content="${canonicalUrl}">`);
          }

          return new Response(html, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=120, must-revalidate"
            }
          });
        }
      } catch (err) {
        console.error("Erro no SSR do Worker:", err);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
