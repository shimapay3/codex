// Reverse proxy worker.
//
//   https://example.com/wt_prod-15374/<path>?<query>  ->  https://example.org/<path>?<query>
//
// Every method (GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, ...) is forwarded
// with its headers, query string and body untouched. Requests that do not start
// with the prefix are answered here and never leave the worker.

const DEFAULT_UPSTREAM = "https://example.org";
const DEFAULT_PREFIX = "/wt_prod-15374";

// Headers that must not be copied between the client and the origin.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function config(env) {
  const upstream = new URL(env.UPSTREAM_ORIGIN || DEFAULT_UPSTREAM);
  const prefix = (env.PATH_PREFIX || DEFAULT_PREFIX).replace(/\/+$/, "");
  return { upstream, prefix };
}

function upstreamUrl(request, env) {
  const { upstream, prefix } = config(env);
  const incoming = new URL(request.url);

  if (incoming.pathname !== prefix && !incoming.pathname.startsWith(`${prefix}/`)) {
    return null;
  }

  const rest = incoming.pathname.slice(prefix.length) || "/";
  const target = new URL(upstream.origin + rest);
  target.search = incoming.search;
  return target;
}

function forwardable(headers) {
  const out = new Headers();
  for (const [key, value] of headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  }
  return out;
}

// Keep redirects inside the proxied prefix instead of leaking the origin host.
function rewriteLocation(location, target, env) {
  const { prefix } = config(env);
  try {
    const redirected = new URL(location, target);
    if (redirected.origin !== target.origin) return location;
    return prefix + redirected.pathname + redirected.search;
  } catch {
    return location;
  }
}

export default {
  async fetch(request, env) {
    const target = upstreamUrl(request, env);
    if (!target) {
      const { upstream, prefix } = config(env);
      if (new URL(request.url).pathname === "/") {
        const mapping = `${prefix}/ -> ${upstream.origin}/`;
        return new Response(
          `<!doctype html><html><head><meta charset="utf-8"><title>Reverse proxy</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;margin:2rem">
<h1 style="font-size:1.1rem">Reverse proxy</h1>
<p><code>${mapping}</code> &mdash; all methods forwarded.</p>
<p><a href="${prefix}/">Open ${prefix}/</a></p>
</body></html>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      return new Response("Not Found\n", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const method = request.method.toUpperCase();
    const mayHaveBody = method !== "GET" && method !== "HEAD";

    const upstreamResponse = await fetch(
      new Request(target.toString(), {
        method,
        headers: forwardable(request.headers),
        body: mayHaveBody ? request.body : undefined,
        redirect: "manual",
      }),
    );

    const headers = forwardable(upstreamResponse.headers);
    const location = headers.get("location");
    if (location) headers.set("location", rewriteLocation(location, target, env));

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};
