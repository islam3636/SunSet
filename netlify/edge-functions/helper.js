const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "x-forwarded-for", "x-real-ip"
]);

export default async function handler(request) {
  if (!TARGET_BASE) {
    return new Response("Configuration error", { 
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }

  try {
    const url = new URL(request.url);
    const targetUrl = `${TARGET_BASE}${url.pathname}${url.search}`;

    const headers = new Headers();
    let clientIp = request.headers.get("x-real-ip") || 
                   request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k) || k.startsWith("x-nf-") || k.startsWith("x-netlify-")) {
        continue;
      }
      headers.set(k, value);
    }

    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
      headers.set("x-real-ip", clientIp);
    }

    const method = request.method;
    const hasBody = !["GET", "HEAD"].includes(method);

    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      const k = key.toLowerCase();
      if (k === "transfer-encoding" || (k === "content-length" && upstream.body)) continue;
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error("Helper error:", error);
    return new Response("Service unavailable", { 
      status: 502,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
