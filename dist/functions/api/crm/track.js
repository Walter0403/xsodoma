// Cloudflare Pages Function — Dedicated Telemetry Ingestion Endpoint (/api/crm/track)
import { recordSearchEvent, recordWatchEvent, recordVisitEvent, recordAdEvent } from "../../telemetryStore.js";

export async function onRequest(context) {
  const { request } = context;

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const type = body.type || "pageview";
    if (type === "search" && body.query) {
      recordSearchEvent(body.query, request);
    } else if (type === "watch" && body.videoId) {
      recordWatchEvent(body.videoId, body.title, request);
    } else if (type === "ad_impression") {
      recordAdEvent("impression", body.network);
    } else if (type === "ad_click") {
      recordAdEvent("click", body.network);
    } else {
      recordVisitEvent(request);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ ok: false, error: "POST only" }), { status: 405, headers });
}
