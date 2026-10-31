/*!
 * eporner-api.js — cliente JavaScript para a Eporner API v2
 *
 * Cobre os três métodos públicos:
 *   /api/v2/video/search/   -> busca paginada
 *   /api/v2/video/id/       -> detalhe de um vídeo (e teste de "ainda existe?")
 *   /api/v2/video/removed/  -> lista de IDs removidos
 *
 * Compatível com navegador (script clássico, expõe window.EpornerApi) e com
 * Node/CommonJS (module.exports), sem dependências.
 *
 * ---------------------------------------------------------------------------
 * SOBRE CORS — leia isto antes de depurar
 * ---------------------------------------------------------------------------
 * A API do Eporner é HTTP GET simples. Se o navegador chamar a API direto de
 * uma página servida em outro domínio, a requisição só vai funcionar se o
 * servidor do Eporner responder com o cabeçalho `Access-Control-Allow-Origin`.
 * Isso não está documentado e não é garantido. Se bloquear, o console mostra
 * "blocked by CORS policy" e o fetch rejeita com TypeError.
 *
 * Por isso este cliente aceita um `proxy`. Se você passar um prefixo de proxy,
 * a URL final vira:  proxy + encodeURIComponent(urlDaApi)
 * O seu backend recebe esse endereço, busca no servidor (onde CORS não existe)
 * e devolve o JSON para o navegador. É o caminho recomendado para produção.
 *
 * Uso:
 *   EpornerApi.configure({ proxy: '/api/eporner?url=' });
 *   const r = await EpornerApi.search({ query: 'all', page: 1, perPage: 24 });
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EpornerApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------------------

  var config = {
    // Base da API. Só mude se o Eporner alterar o caminho.
    base: 'https://www.eporner.com/api/v2',

    // Prefixo de proxy. Ex.: 'https://meusite.com/api/eporner?url='
    // Quando preenchido, a URL da API vai codificada no fim deste prefixo.
    // Deixe '' para tentar acesso direto.
    proxy: '',

    // Timeout por requisição, em ms.
    timeoutMs: 20000,

    // Valores padrão dos parâmetros da API.
    thumbsize: 'medium', // small | medium | big
    perPage: 30,         // 1..1000
    order: 'latest',     // latest | longest | shortest | top-rated |
                         // most-popular | top-weekly | top-monthly
    gay: 0,              // 0 = sem conteúdo gay | 1 = inclui | 2 = só gay
    lq: 1                // 0 = sem baixa qualidade | 1 = inclui | 2 = só lq
  };

  // ---------------------------------------------------------------------------
  // Erros
  // ---------------------------------------------------------------------------

  /**
   * Erro tipado, para você distinguir falha de rede de falha de API.
   * kind: 'network' | 'timeout' | 'http' | 'parse' | 'config'
   */
  function EpornerError(message, kind, extra) {
    var err = new Error(message);
    err.name = 'EpornerError';
    err.kind = kind || 'http';
    err.status = (extra && extra.status) || 0;
    err.url = (extra && extra.url) || '';
    err.cause = (extra && extra.cause) || null;
    return err;
  }

  // ---------------------------------------------------------------------------
  // Cache em memória
  // ---------------------------------------------------------------------------
  // Serve para não bater na API de novo ao voltar uma página. Some ao recarregar
  // a aba, o que é o comportamento desejado aqui.

  var cache = new Map();
  var cacheTtlMs = 60 * 1000;

  function cacheGet(key) {
    var hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.t > cacheTtlMs) {
      cache.delete(key);
      return null;
    }
    return hit.v;
  }

  function cacheSet(key, value) {
    cache.set(key, { t: Date.now(), v: value });
  }

  function clearCache() {
    cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Montagem de URL e transporte
  // ---------------------------------------------------------------------------

  function buildApiUrl(method, params) {
    var url = config.base + method;
    var qs = [];

    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });

    if (qs.length) url += '?' + qs.join('&');
    return url;
  }

  function applyProxy(apiUrl) {
    if (!config.proxy) return apiUrl;
    return config.proxy + encodeURIComponent(apiUrl);
  }

  function fetchText(url) {
    // AbortController dá o timeout. Sem ele uma requisição pendurada trava a UI.
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, config.timeoutMs);
    }

    return fetch(url, {
      method: 'GET',
      // Sem cabeçalhos customizados de propósito: mantém a requisição "simples"
      // aos olhos do navegador e evita um preflight OPTIONS desnecessário.
      headers: { Accept: 'application/json, text/plain, */*' },
      mode: 'cors',
      credentials: 'omit',
      cache: 'default',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);

      if (!res.ok) {
        throw EpornerError(
          'A API respondeu HTTP ' + res.status + ' ' + res.statusText,
          'http',
          { status: res.status, url: url }
        );
      }
      return res.text();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);

      if (err && err.name === 'EpornerError') throw err;

      if (err && err.name === 'AbortError') {
        throw EpornerError('Tempo esgotado após ' + config.timeoutMs + 'ms', 'timeout', { url: url });
      }

      // TypeError aqui é quase sempre CORS ou DNS/host inacessível.
      throw EpornerError(
        'Falha de rede ao chamar a API. Causa mais provável: bloqueio de CORS. ' +
        'Configure um proxy em EpornerApi.configure({ proxy: "..." }).',
        'network',
        { url: url, cause: err }
      );
    });
  }

  function getJson(method, params) {
    var apiUrl = buildApiUrl(method, params);
    var key = 'json:' + apiUrl;

    var cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);

    return fetchText(applyProxy(apiUrl)).then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw EpornerError('A resposta não é JSON válido.', 'parse', { url: apiUrl, cause: e });
      }
      cacheSet(key, data);
      return data;
    });
  }

  function getText(method, params) {
    var apiUrl = buildApiUrl(method, params);
    var key = 'text:' + apiUrl;

    var cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);

    return fetchText(applyProxy(apiUrl)).then(function (text) {
      cacheSet(key, text);
      return text;
    });
  }

  // ---------------------------------------------------------------------------
  // Normalização
  // ---------------------------------------------------------------------------
  // A API devolve campos como string vazia, número em string, data "1970-01-01"
  // em vídeos sem data confiável. Normalizar uma vez só deixa o resto do app
  // limpo e evita `if` espalhado pela view.

  var THUMB_SUFFIX = { small: '_152', medium: '_240', big: '_360' };

  function normalizeKeywords(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map(function (k) { return k.trim(); })
      .filter(function (k) { return k.length > 0; });
  }

  function normalizeThumb(t, fallbackSize) {
    if (!t || typeof t !== 'object' || !t.src) return null;
    return {
      src: t.src,
      width: Number(t.width) || 0,
      height: Number(t.height) || 0,
      size: t.size || fallbackSize || config.thumbsize
    };
  }

  function normalizeVideo(v) {
    if (!v || !v.id) return null;

    var added = v.added && v.added !== '1970-01-01 01:00:00' ? v.added : null;
    var date = added ? new Date(added.replace(' ', 'T')) : null;

    return {
      id: String(v.id),
      title: v.title || '',
      keywords: normalizeKeywords(v.keywords),
      views: Number(v.views) || 0,
      rate: Number(v.rate) || 0,
      url: v.url || '',
      embed: v.embed || '',
      added: added,
      addedDate: date && !isNaN(date.getTime()) ? date : null,
      lengthSec: Number(v.length_sec) || 0,
      lengthMin: v.length_min || '',
      thumb: normalizeThumb(v.default_thumb, v.default_thumb && v.default_thumb.size),
      thumbs: Array.isArray(v.thumbs)
        ? v.thumbs.map(function (t) { return normalizeThumb(t); }).filter(Boolean)
        : []
    };
  }

  /**
   * Troca o tamanho das thumbs sem nova chamada à API.
   * Os CDNs servem _152 / _240 / _360 do mesmo arquivo base.
   */
  function thumbAtSize(video, size) {
    var suffix = THUMB_SUFFIX[size] || THUMB_SUFFIX.medium;
    var pick = function (src) {
      if (!src) return src;
      return src.replace(/_(152|240|360)\.jpg$/i, suffix + '.jpg');
    };
    return {
      thumb: video.thumb ? { src: pick(video.thumb.src), size: size } : null,
      thumbs: video.thumbs.map(function (t) {
        return { src: pick(t.src), size: size };
      })
    };
  }

  // ---------------------------------------------------------------------------
  // Formatação para exibição — helpers opcionais, use se quiser
  // ---------------------------------------------------------------------------

  var nfCompact = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
    : null;

  function formatViews(n) {
    if (nfCompact) return nfCompact.format(n) + ' views';
    return n + ' views';
  }

  function formatDuration(sec) {
    if (!sec) return '0:00';
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var pad = function (x) { return x < 10 ? '0' + x : String(x); };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function formatRate(r) {
    return (Math.round(r * 100) / 100).toFixed(2);
  }

  function formatAdded(date) {
    if (!date) return 'data desconhecida';
    return date.toLocaleDateString('pt-BR');
  }

  // ---------------------------------------------------------------------------
  // Métodos da API
  // ---------------------------------------------------------------------------

  var VALID = {
    thumbsize: ['small', 'medium', 'big'],
    order: ['latest', 'longest', 'shortest', 'top-rated', 'most-popular', 'top-weekly', 'top-monthly']
  };

  function assertOneOf(name, value, allowed) {
    if (allowed.indexOf(value) === -1) {
      throw EpornerError(
        'Valor inválido para "' + name + '": ' + value + '. Aceitos: ' + allowed.join(', '),
        'config'
      );
    }
  }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  /**
   * Busca paginada.
   *
   * @param {Object} [opts]
   * @param {string} [opts.query='all']   termo; 'all' traz tudo
   * @param {number} [opts.page=1]
   * @param {number} [opts.perPage]       1..1000
   * @param {string} [opts.thumbsize]     small | medium | big
   * @param {string} [opts.order]         ver VALID.order
   * @param {number} [opts.gay]           0 | 1 | 2
   * @param {number} [opts.lq]            0 | 1 | 2
   * @param {boolean} [opts.raw=false]    true devolve o JSON cru, sem normalizar
   * @returns {Promise<Object>}
   */
  function search(opts) {
    var o = opts || {};

    var thumbsize = o.thumbsize || config.thumbsize;
    var order = o.order || config.order;
    assertOneOf('thumbsize', thumbsize, VALID.thumbsize);
    assertOneOf('order', order, VALID.order);

    var params = {
      query: o.query || 'all',
      page: clampInt(o.page, 1, 1000000, 1),
      per_page: clampInt(o.perPage, 1, 1000, config.perPage),
      thumbsize: thumbsize,
      order: order,
      gay: [0, 1, 2].indexOf(o.gay) !== -1 ? o.gay : config.gay,
      lq: [0, 1, 2].indexOf(o.lq) !== -1 ? o.lq : config.lq,
      format: 'json'
    };

    return getJson('/video/search/', params).then(function (data) {
      if (o.raw) return data;

      var page = Number(data.page) || params.page;
      var totalPages = Number(data.total_pages) || 0;

      return {
        page: page,
        perPage: Number(data.per_page) || params.per_page,
        totalCount: Number(data.total_count) || 0,
        totalPages: totalPages,
        count: Number(data.count) || 0,
        start: Number(data.start) || 0,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        videos: (data.videos || []).map(normalizeVideo).filter(Boolean)
      };
    });
  }

  /**
   * Detalhe de um vídeo.
   * A API devolve [] (array vazio) quando o ID não existe mais — ou seja, este
   * método também funciona como teste de "o vídeo ainda está no ar?".
   *
   * @param {string} id  11 caracteres, case-sensitive
   * @param {Object} [opts] { thumbsize, raw }
   * @returns {Promise<Object|null>}  null quando removido/inexistente
   */
  function getById(id, opts) {
    var o = opts || {};

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return Promise.reject(EpornerError('getById precisa de um id não vazio.', 'config'));
    }

    var thumbsize = o.thumbsize || config.thumbsize;
    assertOneOf('thumbsize', thumbsize, VALID.thumbsize);

    var params = {
      id: id.trim(),
      thumbsize: thumbsize,
      format: 'json'
    };

    return getJson('/video/id/', params).then(function (data) {
      if (o.raw) return data;

      // Resposta vazia: [] ou {} ou {video: {}} dependendo do caso.
      if (Array.isArray(data)) return data.length ? normalizeVideo(data[0]) : null;
      if (data && data.video && typeof data.video === 'object') {
        return data.video.id ? normalizeVideo(data.video) : null;
      }
      if (data && data.id) return normalizeVideo(data);

      // Loga a forma inesperada uma vez, para você descobrir mudanças na API.
      if (data && Object.keys(data).length) {
        console.warn('[eporner-api] formato inesperado em /video/id/:', data);
      }
      return null;
    });
  }

  /**
   * Lista completa de IDs removidos. Atenção: são vários megabytes.
   * Só chame quando precisar e prefira cachear o resultado do seu lado.
   *
   * @param {Object} [opts]
   * @param {string} [opts.format='txt']  txt (menor) | json
   * @returns {Promise<string[]>} lista de IDs
   */
  function getRemoved(opts) {
    var o = opts || {};
    var format = o.format === 'json' ? 'json' : 'txt';

    if (format === 'json') {
      return getJson('/video/removed/', { format: 'json' }).then(function (data) {
        if (!Array.isArray(data)) return [];
        return data.map(function (row) { return row && row.id; }).filter(Boolean);
      });
    }

    return getText('/video/removed/', { format: 'txt' }).then(function (text) {
      return text
        .split(/\r?\n/)
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l.length > 0; });
    });
  }

  /**
   * Variante útil: Set dos IDs removidos, para consulta O(1).
   *   const removed = await EpornerApi.getRemovedSet();
   *   if (removed.has(video.id)) { ... }
   */
  function getRemovedSet(opts) {
    return getRemoved(opts).then(function (ids) { return new Set(ids); });
  }

  /**
   * Confere se um ID ainda está no ar. Faz uma chamada por ID.
   * Para muitos IDs use getRemovedSet() — é uma chamada só.
   */
  function isAlive(id) {
    return getById(id, { raw: true }).then(function (data) {
      if (Array.isArray(data)) return data.length > 0;
      if (data && data.video) return !!data.video.id;
      return !!(data && data.id);
    });
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  return {
    // configuração
    configure: function (opts) {
      Object.keys(opts || {}).forEach(function (k) {
        if (k === 'base' || k === 'proxy' || k === 'timeoutMs' ||
            k === 'thumbsize' || k === 'perPage' || k === 'order' ||
            k === 'gay' || k === 'lq') {
          config[k] = opts[k];
        }
      });
      clearCache();
      return this;
    },
    getConfig: function () { return Object.assign({}, config); },

    // chamadas
    search: search,
    getById: getById,
    getRemoved: getRemoved,
    getRemovedSet: getRemovedSet,
    isAlive: isAlive,

    // utilitários
    clearCache: clearCache,
    buildApiUrl: buildApiUrl,
    normalizeVideo: normalizeVideo,
    thumbAtSize: thumbAtSize,

    // formatação
    formatViews: formatViews,
    formatDuration: formatDuration,
    formatRate: formatRate,
    formatAdded: formatAdded,

    // constantes
    THUMB_SIZE: { small: 'small', medium: 'medium', big: 'big' },
    ORDER: VALID.order.slice(),
    EpornerError: EpornerError
  };
});
