import { onRequest as epornerHandler } from "./functions/api/eporner.js";
import { onRequest as thumbHandler } from "./functions/api/thumb.js";
import { onRequest as crmHandler } from "./functions/api/crm.js";
import { onRequest as trackHandler } from "./functions/api/crm/track.js";
import { onRequest as authHandler } from "./functions/api/auth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Rotas de API com execução Edge
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

    // Servir assets estáticos (HTML, JS, CSS, Imagens, Robots, LLMS)
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
