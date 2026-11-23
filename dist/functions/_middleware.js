// Cloudflare Pages Edge Middleware — WAF Security Firewall + Pooled SSR Connection Manager + Master Programmatic SEO
// Suporta: Home, Regiões (BR, PT, US, CA, ES), Silos (/categoria/:slug), Blog (/blog/:slug) e Vídeos (/video/:id/:slug)
import catalog from "./data/catalog.json";
import { recordVisitEvent, recordSearchEvent, recordWatchEvent } from "./telemetryStore.js";

const SITE_URL = "https://x-sodoma.com";

// Mapa de alta performance em memória para busca instantânea de vídeos por ID (<0.1ms)
const catalogMap = new Map();
for (const v of catalog) {
  catalogMap.set(v.id, v);
}

// 1. Firewall contra varreduras de hackers (.env, .git, chaves, backups, configs)
const BLOCKED_PATH_REGEX =
  /(^|\/)(\.env|\.git|\.dev\.vars|\.wrangler|wp-admin|wp-login|wp-config|phpmyadmin|admin\.php|server\.js|wrangler\.toml|composer\.json|package\.json)|\.(sql|bak|key|pem|log|sh|bat|py|ini|conf)$/i;

const LOCALE_SEO = {
  "pt-br": {
    htmlLang: "pt-BR",
    ogLocale: "pt_BR",
    geoRegion: "BR",
    geoPlace: "São Paulo, Brasil",
    prefix: "/pt-br",
    title: "X — Vídeos de Sexo, Pornô Grátis & Filmes Adultos HD 4K | XSodoma",
    description:
      "Assista ao melhor portal X: vídeos de sexo amador, pornô grátis em Full HD e 4K, brasileiras gostosas, novinhas, flagras caseiros e lançamentos diários sem cadastro no X XSodoma.",
    keywords:
      "x, porno, sexo, pornô, porno gratis, videos de sexo, sexo amador, xvideos, pornhub, porno brasil, brasileiras, novinhas, coroas, sexo caseiro, amadoras gostosas, tube adulto 4k, pornografia gratis, sambaporno, xhamster",
    videoSuffix: "Vídeo de Sexo HD Grátis | X XSodoma Brasil",
    catPrefix: "Vídeos de Sexo e Pornô",
    catSuffix: "Grátis em HD 4K — X XSodoma Brasil",
    watchVerb: "Assista gratuitamente em HD no X:",
  },
  "pt-pt": {
    htmlLang: "pt-PT",
    ogLocale: "pt_PT",
    geoRegion: "PT",
    geoPlace: "Lisboa, Portugal",
    prefix: "/pt-pt",
    title: "XSodoma Portugal — Vídeos Porno Grátis em HD e 4K | Mulheres e Tuga",
    description:
      "Vê os melhores vídeos de porno grátis, mulheres, brasileiras, tugas e amadoras em Full HD e 4K no XSodoma Portugal. Mais de 4,5 milhões de vídeos atualizados todos os dias.",
    keywords:
      "porno, xvideos, videos porno gratis portugal, porno tuga hd, mulheres, videos adultos 4k, amadoras portuguesas, xsodoma portugal, filmes adultos gratis, europeias, loiras",
    videoSuffix: "Ver Vídeo HD Grátis | XSodoma Portugal",
    catPrefix: "Vídeos de",
    catSuffix: "Grátis em HD 4K — XSodoma Portugal",
    watchVerb: "Vê gratuitamente em HD:",
  },
  "en-us": {
    htmlLang: "en-US",
    ogLocale: "en_US",
    geoRegion: "US",
    geoPlace: "New York, United States",
    prefix: "/en-us",
    title: "XSodoma USA — Free Porn Videos, Hot Women, HD 4K Adult Tube & Sex",
    description:
      "Watch over 4.5 million free HD & 4K porn videos on XSodoma USA. Daily updated hot women, amateur sex, blonde, brunette, MILF, Latina, and full-length streaming adult videos.",
    keywords:
      "free porn, porn videos, hot women, xvideos, porno, hd adult tube, 4k porn usa, american amateur, blonde, milf, latina, free sex videos, xsodoma usa, streaming adult videos",
    videoSuffix: "Watch Free HD Porn Video | XSodoma USA",
    catPrefix: "Free",
    catSuffix: "HD & 4K Porn Videos — XSodoma USA",
    watchVerb: "Watch free in Full HD:",
  },
  "en-ca": {
    htmlLang: "en-CA",
    ogLocale: "en_CA",
    geoRegion: "CA",
    geoPlace: "Toronto, Canada",
    prefix: "/en-ca",
    title: "XSodoma Canada — Free HD & 4K Adult Videos | Canadian Porn Tube",
    description:
      "Stream 4.5M+ free Full HD and 4K adult videos on XSodoma Canada. Top rated Canadian & international amateur, blonde, brunette, and verified 60fps videos updated hourly.",
    keywords:
      "free porn canada, canadian adult tube, hd sex videos, 4k porn streaming, amateur videos canada, xsodoma canada, free adult movies",
    videoSuffix: "Watch Free HD Video | XSodoma Canada",
    catPrefix: "Free",
    catSuffix: "HD & 4K Adult Videos — XSodoma Canada",
    watchVerb: "Stream free in Full HD:",
  },
  "es-es": {
    htmlLang: "es-ES",
    ogLocale: "es_ES",
    geoRegion: "ES",
    geoPlace: "Madrid, España",
    prefix: "/es-es",
    title: "XSodoma España — Videos Porno Gratis en HD y 4K | Tube Adulto",
    description:
      "Disfruta de más de 4,5 milhões de videos porno gratis en Full HD y 4K en XSodoma España. Videos caseros, españolas, latinas, rubias, morenas y estrenos diarios.",
    keywords:
      "videos porno gratis espana, porno casero hd, videos adultos 4k, espanolas amateur, latinas, rubias, morenas, xsodoma espana, sexo gratis",
    videoSuffix: "Ver Video Porno HD Gratis | XSodoma España",
    catPrefix: "Videos de",
    catSuffix: "Gratis en HD 4K — XSodoma España",
    watchVerb: "Mira gratis en Full HD:",
  },
  en: {
    htmlLang: "en",
    ogLocale: "en_US",
    geoRegion: "US",
    geoPlace: "United States",
    prefix: "/en",
    title: "XSodoma — Free HD Porn Videos, 4K Adult Tube & Streaming",
    description:
      "Watch over 4.5 million free Full HD and 4K adult videos on XSodoma. Fast streaming, daily new releases, amateur, blonde, brunette, Latina, and top-rated videos.",
    keywords:
      "free porn videos, hd adult tube, 4k sex videos, amateur porn, xsodoma, free adult streaming",
    videoSuffix: "Watch Free HD Video | XSodoma",
    catPrefix: "Free",
    catSuffix: "HD Adult Videos — XSodoma",
    watchVerb: "Watch free in Full HD:",
  },
};

function slugify(text) {
  return (
    String(text || "video")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "video"
  );
}

function isoDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return `PT${hrs > 0 ? hrs + "H" : ""}${mins}M${secs}S`;
}

function resolveVideoData(videoId, slug) {
  if (!videoId) return null;
  const found = catalogMap.get(videoId);
  if (found) return found;

  // Deriva dinamicamente metadados a partir do slug se não estiver explicitamente no catálogo
  const cleanSlug = (slug || "").replace(/[^a-zA-Z0-9-]/g, "");
  const titleWords = cleanSlug
    ? cleanSlug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : "Vídeo HD";

  const durationSeed = Math.abs(videoId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
  return {
    id: videoId,
    title: titleWords || `Vídeo HD XSodoma ${videoId}`,
    length_sec: 480 + (durationSeed % 600),
    views: 12000 + ((durationSeed * 17) % 35000),
    rate: 96,
    added: "2024-01-01",
    embed: `https://www.eporner.com/embed/${videoId}/`,
    default_thumb: {
      src: "https://static-ca-cdn.eporner.com/thumbs/static4/2/28/289/289/5_360.jpg",
    },
    keywords: cleanSlug.replace(/-/g, " "),
  };
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname || "/");
  const userAgent = request.headers.get("user-agent") || "";
  const isSearchBot = /Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp/i.test(userAgent);

  // 1. Bloqueio Imediato de Segurança (WAF contra varreduras maliciosas)
  if (
    path.includes("..") ||
    (!isSearchBot && BLOCKED_PATH_REGEX.test(path)) ||
    (isSearchBot && /\.(env|git|key|pem)$/i.test(path))
  ) {
    return new Response(JSON.stringify({ error: "403 Forbidden — Protected Resource" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    });
  }

  // Rota exclusiva do Painel Administrativo & CRM (/admin)
  if (path.startsWith("/admin")) {
    return next();
  }

  // Ignora rotas de API, sitemaps estáticos na CDN, arquivos estáticos e verificações
  if (
    path.startsWith("/api/") ||
    path.includes("sitemap") ||
    path === "/robots.txt" ||
    path === "/2257.html" ||
    path === "/dmca.html" ||
    /\.(png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|json|xml|txt|woff2?)$/i.test(path) ||
    path.startsWith("/google") ||
    path.startsWith("/f554d56")
  ) {
    return next();
  }

  // Detecta rota de país/idioma e/ou sub-rota (/video, /categoria, /blog)
  const localeMatch = path.match(/^\/(pt-br|pt-pt|en-us|en-ca|es-es|en)(?:\/(.*))?$/i);
  let localeKey = localeMatch ? localeMatch[1].toLowerCase() : null;
  const remainderPath = localeMatch ? "/" + (localeMatch[2] || "") : path;

  if (!localeKey) {
    const cfCountry = (request.cf && request.cf.country ? String(request.cf.country) : "").toUpperCase();
    if (cfCountry === "PT") localeKey = "pt-pt";
    else if (cfCountry === "US") localeKey = "en-us";
    else if (cfCountry === "CA") localeKey = "en-ca";
    else if (cfCountry === "ES" || cfCountry === "MX" || cfCountry === "AR" || cfCountry === "CO" || cfCountry === "CL")
      localeKey = "es-es";
    else localeKey = "pt-br";
  }

  const seo = LOCALE_SEO[localeKey] || LOCALE_SEO["pt-br"];

  // Redirecionamento 301 Limpo para URLs de /video/ vazias (corrige erros de indexação e canonical no Google)
  if (remainderPath === "/video" || remainderPath === "/video/") {
    const dest = localeMatch ? `${SITE_URL}${seo.prefix}/` : `${SITE_URL}/`;
    return Response.redirect(dest, 301);
  }

  // Identifica tipo de página: Vídeo (/video/:id/:slug), Categoria/Tag (/categoria, /tag, /busca, /search) ou Blog (/blog/:slug)
  const videoMatch = remainderPath.match(/^\/video\/([^\/]+)(?:\/([^\/]*))?/i);
  const catMatch = remainderPath.match(/^\/(?:categoria|category|tag|busca|search)\/([^\/]+)/i);
  const blogMatch = remainderPath.match(/^\/blog(?:\/([^\/]+))?/i);

  let videoData = null;
  if (videoMatch && videoMatch[1]) {
    videoData = resolveVideoData(videoMatch[1], videoMatch[2]);
  }

  // Telemetria Real Automática para Visitantes (Edge Cloudflare)
  if (!isSearchBot) {
    try {
      const qParam = url.searchParams.get("q");
      if (qParam && qParam.trim() && qParam !== "all") {
        recordSearchEvent(qParam, request);
      } else if (catMatch && catMatch[1]) {
        recordSearchEvent(catMatch[1].replace(/-/g, " "), request);
      } else if (videoMatch && videoMatch[1]) {
        recordWatchEvent(videoMatch[1], videoData?.title || videoMatch[1], request);
      } else {
        recordVisitEvent(request);
      }
    } catch (_) {}
  }

  let response = await next();
  if ((!response || response.status === 404 || response.status === 403) && context.env && context.env.ASSETS) {
    try {
      response = await context.env.ASSETS.fetch(new URL("/", request.url));
    } catch (_) {}
  }
  const contentType = (response && response.headers.get("content-type")) || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  let pageTitle = seo.title;
  let pageDesc = seo.description;
  let pageKeywords = seo.keywords;
  let ogImage = `${SITE_URL}/favicon.png`;
  let ogVideo = "";
  let ogType = "website";
  let canonicalUrl = localeMatch
    ? `${SITE_URL}${seo.prefix}${remainderPath === "/" ? "/" : remainderPath}`
    : `${SITE_URL}${path === "/" ? "/" : path}`;
  let subpathForHreflang = remainderPath === "/" ? "/" : remainderPath;

  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "XSodoma",
      item: `${SITE_URL}${seo.prefix}/`,
    },
  ];

  if (videoData) {
    const vSlug = slugify(videoData.title);
    subpathForHreflang = `/video/${videoData.id}/${vSlug}`;
    // Canonical autorreferencial alinhada ao cluster Hreflang (elimina o erro 'Página alternativa' no Search Console)
    canonicalUrl = localeMatch
      ? `${SITE_URL}${seo.prefix}/video/${videoData.id}/${vSlug}`
      : `${SITE_URL}/video/${videoData.id}/${vSlug}`;
    pageTitle = `${videoData.title} — ${seo.videoSuffix}`;
    const tagsStr = videoData.keywords ? ` Tags: ${videoData.keywords}.` : "";
    pageDesc = `${seo.watchVerb} ${videoData.title} (${Math.floor((videoData.length_sec || 0) / 60)} min). Assista em Full HD e 4K no XSodoma.${tagsStr}`;
    if (videoData.keywords) {
      pageKeywords = `${videoData.keywords}, ${seo.keywords}`;
    }

    const rawThumb = (videoData.default_thumb && videoData.default_thumb.src) || `${SITE_URL}/favicon.png`;
    // Passa a imagem pelo proxy Edge seguro para o Googlebot NUNCA falhar ao baixar miniatura (resolve "Não foi possível acessar a miniatura")
    ogImage = rawThumb.startsWith("http")
      ? `${SITE_URL}/api/thumb?url=${encodeURIComponent(rawThumb)}`
      : rawThumb;

    ogVideo = videoData.embed || `https://www.eporner.com/embed/${videoData.id}/`;
    ogType = "video.other";

    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: videoData.title,
      item: canonicalUrl,
    });
  } else if (catMatch && catMatch[1]) {
    const rawCat = decodeURIComponent(catMatch[1]).replace(/-/g, " ");
    const capCat = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
    pageTitle = `${seo.catPrefix} ${capCat} ${seo.catSuffix}`;
    pageDesc = `${capCat} — ${seo.description}`;
    pageKeywords = `${rawCat}, ${seo.keywords}`;
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: capCat,
      item: canonicalUrl,
    });
  } else if (blogMatch) {
    const articleSlug = blogMatch[1] ? decodeURIComponent(blogMatch[1]).replace(/-/g, " ") : "";
    pageTitle = articleSlug
      ? `${articleSlug.charAt(0).toUpperCase() + articleSlug.slice(1)} — Blog & Guias | XSodoma`
      : `Hub de Tendências, Guias 4K & SEO Global — XSodoma`;
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: "Blog & Guias",
      item: `${SITE_URL}${seo.prefix}/blog`,
    });
  }

  // Schemas JSON-LD: WebSite + Organization + BreadcrumbList + VideoObject / FAQPage
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "X-Sodoma",
      alternateName: ["XSodoma", "XSodoma Brasil", "XSodoma Portugal", "XSodoma USA", "XSodoma Canada", "XSodoma España"],
      url: `${SITE_URL}${seo.prefix}/`,
      inLanguage: seo.htmlLang,
      isFamilyFriendly: false,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}${seo.prefix}/?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "X-Sodoma",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
      sameAs: [
        `${SITE_URL}/pt-br/`,
        `${SITE_URL}/pt-pt/`,
        `${SITE_URL}/en-us/`,
        `${SITE_URL}/en-ca/`,
        `${SITE_URL}/es-es/`,
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    },
  ];

  if (videoData) {
    const pubDateIso = videoData.added
      ? new Date(videoData.added.replace(" ", "T") + "Z").toISOString()
      : "2024-01-01T00:00:00.000Z";

    schemas.push({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: videoData.title,
      description: pageDesc,
      thumbnailUrl: [ogImage],
      uploadDate: pubDateIso,
      duration: isoDuration(videoData.length_sec),
      embedUrl: ogVideo,
      contentUrl: canonicalUrl,
      inLanguage: seo.htmlLang,
      isFamilyFriendly: false,
      interactionStatistic: {
        "@type": "InteractionCounter",
        interactionType: { "@type": "WatchAction" },
        userInteractionCount: Number(videoData.views) || 12000,
      },
    });
  } else {
    // FAQPage estruturado para GEO / AI Search (ChatGPT, Perplexity, Gemini)
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What resolutions and streaming technologies does X-Sodoma support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "X-Sodoma delivers instant HTML5 adaptive streaming in 1080p Full HD, 60fps, and 4K Ultra HD across mobile, tablet, and desktop devices with over 4.5 million indexed videos.",
          },
        },
        {
          "@type": "Question",
          name: "Which regions and languages are officially supported by X-Sodoma?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "X-Sodoma provides dedicated localized experiences for the United States (en-US), Canada (en-CA), Brazil (pt-BR), Portugal (pt-PT), and Spain (es-ES).",
          },
        },
      ],
    });
  }

  let rewriter = new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append('<meta name="google-site-verification" content="google932ad46edbcde79b">\n', { html: true });
      },
    })
    .on("html", {
      element(el) {
        el.setAttribute("lang", seo.htmlLang);
      },
    })
    .on("title", {
      element(el) {
        el.setInnerContent(pageTitle);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", pageDesc);
      },
    })
    .on('meta[name="keywords"]', {
      element(el) {
        el.setAttribute("content", pageKeywords);
      },
    })
    .on('meta[name="geo.region"]', {
      element(el) {
        el.setAttribute("content", seo.geoRegion);
      },
    })
    .on('meta[name="geo.placename"]', {
      element(el) {
        el.setAttribute("content", seo.geoPlace);
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.setAttribute("href", canonicalUrl);
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(el) {
        const hl = (el.getAttribute("hreflang") || "").toLowerCase();
        const suffix = subpathForHreflang === "/" ? "/" : subpathForHreflang;
        if (hl === "en" || hl === "x-default") el.setAttribute("href", `${SITE_URL}/en${suffix}`);
        else if (hl === "en-us") el.setAttribute("href", `${SITE_URL}/en-us${suffix}`);
        else if (hl === "en-ca") el.setAttribute("href", `${SITE_URL}/en-ca${suffix}`);
        else if (hl === "pt-br") el.setAttribute("href", `${SITE_URL}/pt-br${suffix}`);
        else if (hl === "pt-pt") el.setAttribute("href", `${SITE_URL}/pt-pt${suffix}`);
        else if (hl === "es-es") el.setAttribute("href", `${SITE_URL}/es-es${suffix}`);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute("content", pageTitle);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute("content", pageDesc);
      },
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute("content", canonicalUrl);
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute("content", ogImage);
      },
    })
    .on('meta[property="og:type"]', {
      element(el) {
        el.setAttribute("content", ogType);
      },
    })
    .on('meta[property="og:locale"]', {
      element(el) {
        el.setAttribute("content", seo.ogLocale);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute("content", pageTitle);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute("content", pageDesc);
      },
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute("content", ogImage);
      },
    })
    .on("#schemaJsonLd", {
      element(el) {
        el.setInnerContent(JSON.stringify(schemas), { html: true });
      },
    });

  // SE FOR PÁGINA DE VÍDEO: Transforma o DOM SSR diretamente para o Googlebot reconhecer a Watch Page ("O vídeo não está em uma página de exibição")
  if (videoData) {
    rewriter = rewriter
      .on("body", {
        element(el) {
          const currentClass = el.getAttribute("class") || "";
          el.setAttribute("class", (currentClass + " watching-video").trim());
        },
      })
      .on("#homeView", {
        element(el) {
          el.setAttribute("style", "display:none !important");
        },
      })
      .on("#watchView", {
        element(el) {
          el.setAttribute("class", "yt-watch-view active");
          el.setAttribute("style", "display:block !important; min-height:80vh;");
        },
      })
      .on("#modalPlayer", {
        element(el) {
          el.setAttribute("src", ogVideo);
          el.setAttribute("width", "100%");
          el.setAttribute("height", "540");
          el.setAttribute("title", videoData.title);
          el.setAttribute("style", "width:100%; height:100%; min-height:420px; aspect-ratio:16/9; border:none; display:block;");
        },
      })
      .on("#modalTitle", {
        element(el) {
          el.setInnerContent(videoData.title);
        },
      })
      .on("#modalStats", {
        element(el) {
          const formattedViews = Number(videoData.views || 12000).toLocaleString("pt-BR");
          const minutes = Math.floor((videoData.length_sec || 600) / 60);
          el.setInnerContent(
            `<div class="yt-views-date"><span>${formattedViews} visualizações</span> • <span>Duração: ${minutes} min</span> • <span class="badge badge-4k">4K Ultra HD</span></div>`,
            { html: true }
          );
        },
      });
  }

  const rewritten = rewriter.transform(response);

  const newHeaders = new Headers(rewritten.headers);
  newHeaders.set("Content-Language", seo.htmlLang);
  newHeaders.set("Vary", "Accept-Language, CF-IPCountry");
  newHeaders.set("X-Content-Type-Options", "nosniff");
  newHeaders.set("X-Frame-Options", "SAMEORIGIN");
  newHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  newHeaders.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  newHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");

  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers: newHeaders,
  });
}
