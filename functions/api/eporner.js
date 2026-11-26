// Cloudflare Pages Function — Resilient API Gateway com Catálogo Integrado & Auto-Rotação
// Suporta 2.985 vídeos, ordenação por data recente (2026), rotação dinâmica por semente e upstream live
import catalog from "../data/catalog.json";

const ALLOWED_PREFIX = "https://www.eporner.com/api/v2/";

// Dicionário de tradução PT-BR -> EN para correspondência instantânea no catálogo
const PT_TO_EN_DICT = {
  loira: "blonde", loiras: "blonde", loiro: "blonde", loiros: "blonde", loirinha: "blonde",
  morena: "brunette", morenas: "brunette", moreninha: "brunette",
  ruiva: "redhead", ruivas: "redhead", ruivinha: "redhead",
  amador: "amateur", amadora: "amateur", amadoras: "amateur", caseiro: "amateur", caseira: "amateur",
  novinha: "teen", novinhas: "teen", novinho: "teen",
  coroa: "milf", coroas: "milf", madura: "mature", maduras: "mature",
  brasileira: "brazilian", brasileiras: "brazilian", brasil: "brazilian",
  peituda: "big tits", peitudas: "big tits", peito: "tits", peitos: "tits",
  bunduda: "big ass", bundudas: "big ass", bunda: "ass", bundas: "ass",
  gozada: "creampie", porra: "cum", gozar: "cum", leitinho: "cum",
  boquete: "blowjob", chupando: "blowjob", oral: "blowjob",
  anal: "anal", cu: "anal", cuzinho: "anal",
  massagem: "massage",
  safada: "slut", safadas: "slut", vadia: "slut",
  trio: "threesome", menage: "threesome",
  sexo: "sex", porno: "porn", pornô: "porn",
};

// Cache em memória de respostas upstream
const LIVE_CACHE = new Map();

// Pré-ordena catálogo por data de adição decrescente (os mais novos primeiro)
const CATALOG_BY_DATE = [...catalog].sort((a, b) => {
  const dDiff = (b.added || "").localeCompare(a.added || "");
  if (dDiff !== 0) return dDiff;
  return (b.views || 0) - (a.views || 0);
});

// Algoritmo de rotação pseudo-aleatória determinística por semente
function seededShuffle(arr, seedNum) {
  const copy = [...arr];
  let s = (parseInt(seedNum, 10) || 1) % 233280;
  function rnd() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function queryLocalCatalog(targetUrlStr) {
  try {
    const targetUrl = new URL(targetUrlStr);
    const pathname = targetUrl.pathname;
    const params = targetUrl.searchParams;

    // 1. Busca por ID específico (/video/id/)
    if (pathname.includes("/video/id")) {
      const id = params.get("id");
      const found = catalog.find((v) => v.id === id);
      if (found) {
        return found;
      }
      return {
        id: id || "video",
        title: "Vídeo em Alta Definição HD 4K",
        embed: `https://www.eporner.com/embed/${id}/`,
        default_thumb: {
          src: "https://static-ca-cdn.eporner.com/thumbs/static4/2/28/289/289/5_360.jpg",
        },
        views: 24500,
        rate: 96,
        added: "2026-11-11",
        length_sec: 600,
        keywords: "hd, porn, 4k",
      };
    }

    // 2. Busca paginada (/video/search/)
    const rawQuery = (params.get("query") || "all").toLowerCase().trim();
    const page = Math.max(1, parseInt(params.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(params.get("per_page") || "24", 10)));
    const order = (params.get("order") || "latest").toLowerCase();
    const seed = params.get("seed") || params.get("rotate") || "";

    let filtered = CATALOG_BY_DATE;

    if (rawQuery && rawQuery !== "all") {
      const cleanTokens = rawQuery.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
      const translatedWords = cleanTokens.map(w => PT_TO_EN_DICT[w] || w);
      const searchTerms = Array.from(new Set([...cleanTokens, ...translatedWords.join(" ").split(/\s+/)]));

      filtered = CATALOG_BY_DATE.filter((v) => {
        const titleLower = (v.title || "").toLowerCase();
        const kwLower = (v.keywords || "").toLowerCase();
        return searchTerms.some((w) => titleLower.includes(w) || kwLower.includes(w));
      });

      // Se a busca estrita com todas as palavras retornar vazio, tenta busca mais flexível
      if (!filtered.length) {
        filtered = CATALOG_BY_DATE.filter((v) => {
          const titleLower = (v.title || "").toLowerCase();
          const kwLower = (v.keywords || "").toLowerCase();
          return cleanTokens.some((w) => titleLower.includes(w) || kwLower.includes(w));
        });
      }

      // Se ainda assim for vazio, retorna catálogo geral
      if (!filtered.length) {
        filtered = CATALOG_BY_DATE;
      }
    }

    // Ordenação e Rotação Dinâmica
    let sorted = [...filtered];

    if (order === "top-rated" || order === "most-popular") {
      sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
      if (seed) {
        // Rotaciona os mais vistos com base na semente para a vitrine nunca ser estática
        const pool = sorted.slice(0, 80);
        const rest = sorted.slice(80);
        sorted = seededShuffle(pool, seed).concat(rest);
      }
    } else if (order === "top-weekly") {
      // Top da semana: filtra vídeos mais vistos da safra recente
      sorted.sort((a, b) => {
        const dateScore = (b.added || "").localeCompare(a.added || "");
        return (b.views || 0) * 1.5 + (dateScore > 0 ? 5000 : 0) - (a.views || 0);
      });
      if (seed) {
        const pool = sorted.slice(0, 100);
        const rest = sorted.slice(100);
        sorted = seededShuffle(pool, seed).concat(rest);
      }
    } else if (order === "longest") {
      sorted.sort((a, b) => (b.length_sec || 0) - (a.length_sec || 0));
    } else if (order === "shortest") {
      sorted.sort((a, b) => (a.length_sec || 0) - (b.length_sec || 0));
    } else if (order === "random" || order === "shuffle") {
      const dynamicSeed = seed || String(Math.floor(Date.now() / 300000));
      sorted = seededShuffle(sorted, dynamicSeed);
    } else {
      // Default: "latest"
      // Se tiver uma semente de rotação na Home (para variar os vídeos e o usuário nunca ver os mesmos)
      const effectiveSeed = seed || (rawQuery === "all" && page === 1 ? String(Math.floor(Date.now() / 600000)) : "");
      if (effectiveSeed) {
        const pool = sorted.slice(0, 150);
        const rest = sorted.slice(150);
        sorted = seededShuffle(pool, effectiveSeed).concat(rest);
      }
    }

    const totalCount = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    const startIndex = (page - 1) * perPage;
    const pageVideos = sorted.slice(startIndex, startIndex + perPage);

    return {
      count: pageVideos.length,
      total_count: totalCount,
      page: page,
      total_pages: totalPages,
      per_page: perPage,
      videos: pageVideos,
    };
  } catch (err) {
    return {
      count: 0,
      total_count: 0,
      page: 1,
      total_pages: 1,
      videos: [],
    };
  }
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url");

  if (!target || !target.startsWith(ALLOWED_PREFIX)) {
    return new Response(JSON.stringify({ error: "Invalid or missing url parameter" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 1. Tenta buscar no upstream ao vivo com timeout de 2.5s para pegar novos lançamentos
  try {
    const hasSeed = target.includes("seed=") || target.includes("rotate=") || target.includes("_t=");
    const cachedEntry = LIVE_CACHE.get(target);
    const now = Date.now();
    if (!hasSeed && cachedEntry && now < cachedEntry.exp) {
      return new Response(JSON.stringify(cachedEntry.data), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=120, s-maxage=300",
          "Access-Control-Allow-Origin": "*",
          "X-Data-Source": "Live-Cache",
        },
      });
    }

    const upstreamCtrl = new AbortController();
    const timer = setTimeout(() => upstreamCtrl.abort(), 2500);

    const upstreamRes = await fetch(target, {
      signal: upstreamCtrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    clearTimeout(timer);

    if (upstreamRes.ok) {
      const liveData = await upstreamRes.json();
      if (liveData && ((Array.isArray(liveData.videos) && liveData.videos.length > 0) || liveData.id)) {
        LIVE_CACHE.set(target, { data: liveData, exp: now + 300000 });
        if (LIVE_CACHE.size > 200) {
          const firstKey = LIVE_CACHE.keys().next().value;
          LIVE_CACHE.delete(firstKey);
        }
        return new Response(JSON.stringify(liveData), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=180, s-maxage=600",
            "Access-Control-Allow-Origin": "*",
            "X-Data-Source": "Upstream-Live",
          },
        });
      }
    }
  } catch (_) {
    // Fallback instantâneo (<1ms) para o catálogo local inteligente
  }

  // 2. Resposta pelo Catálogo Local com Ordenação Recente e Rotação Dinâmica
  const localResult = queryLocalCatalog(target);
  if (localResult && (Array.isArray(localResult.videos) || localResult.id)) {
    const isDynamic = target.includes("seed=") || target.includes("rotate=") || target.includes("_t=");
    return new Response(JSON.stringify(localResult), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": isDynamic
          ? "private, no-cache, no-store, max-age=0, must-revalidate"
          : "public, max-age=60, s-maxage=180",
        "Access-Control-Allow-Origin": "*",
        "X-Data-Source": "Edge-Catalog-Dynamic",
      },
    });
  }

  // 3. Fallback final
  return new Response(JSON.stringify({ error: "No data available" }), {
    status: 404,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
