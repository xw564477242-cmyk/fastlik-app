const BACKEND_ORIGIN_PATTERN = /^https:\/\/[^/]+$/;
const ALLOWED_ENVIRONMENTS = new Set(["SANDBOX", "TEST", "PRODUCTION"]);

function requiredBinding(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function runtimeIdentity(env) {
  const environment = requiredBinding(env, "FASTLINK_ENVIRONMENT").toUpperCase();
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error("FASTLINK_ENVIRONMENT must be SANDBOX, TEST, or PRODUCTION");
  }

  const serviceName = requiredBinding(env, "FASTLINK_SERVICE_NAME");
  const proxyId = requiredBinding(env, "FASTLINK_PROXY_ID");
  const apiUrl = requiredBinding(env, "FASTLINK_API_URL");
  const buildSha = requiredBinding(env, "FASTLINK_BUILD_SHA");
  if (apiUrl !== "/api") throw new Error("Cloudflare frontend API URL must be same-origin /api");
  if (!/^[0-9a-f]{40}$/i.test(buildSha)) throw new Error("FASTLINK_BUILD_SHA must be a full Git SHA");
  if (environment === "TEST" && (!serviceName.endsWith("-test") || !proxyId.endsWith("-test"))) {
    throw new Error("TEST Worker identity must use isolated -test names");
  }
  if (environment === "SANDBOX" && (!serviceName.endsWith("-dev") || !proxyId.endsWith("-dev"))) {
    throw new Error("SANDBOX Worker identity must use isolated -dev names");
  }

  return { environment, serviceName, proxyId, apiUrl, buildSha };
}

function requireBackendOrigin(env) {
  const configured = requiredBinding(env, "FASTLINK_BACKEND_ORIGIN");
  if (!BACKEND_ORIGIN_PATTERN.test(configured)) {
    throw new Error("FASTLINK_BACKEND_ORIGIN must be an HTTPS origin without a path");
  }
  return configured;
}

function proxyHeaders(request, publicUrl, env) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  const backendRequestOrigin = env.FASTLINK_BACKEND_REQUEST_ORIGIN?.trim();
  if (backendRequestOrigin) {
    if (!BACKEND_ORIGIN_PATTERN.test(backendRequestOrigin)) {
      throw new Error("FASTLINK_BACKEND_REQUEST_ORIGIN must be an HTTPS origin without a path");
    }
    headers.set("origin", backendRequestOrigin);
  }
  headers.delete("forwarded");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.set("x-forwarded-host", publicUrl.host);
  headers.set("x-forwarded-proto", "https");
  return headers;
}

function secureHeaders(headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  return headers;
}

async function proxyBackend(request, env) {
  const identity = runtimeIdentity(env);
  const publicUrl = new URL(request.url);
  const backendUrl = new URL(publicUrl.pathname + publicUrl.search, requireBackendOrigin(env));
  const response = await fetch(backendUrl, {
    method: request.method,
    headers: proxyHeaders(request, publicUrl, env),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const headers = secureHeaders(new Headers(response.headers));
  headers.set("cache-control", "no-store");
  headers.set("x-fastlink-api-proxy", identity.proxyId);
  headers.set("x-fastlink-environment", identity.environment);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function runtimeConfig(env) {
  const identity = runtimeIdentity(env);
  const script = `window.__FASTLINK_RUNTIME__ = Object.freeze(${JSON.stringify({
    environment: identity.environment,
    apiUrl: identity.apiUrl,
    buildSha: identity.buildSha,
  })});\n`;
  return new Response(script, {
    headers: secureHeaders(new Headers({
      "cache-control": "no-store",
      "content-type": "application/javascript; charset=utf-8",
    })),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      const identity = runtimeIdentity(env);
      return Response.json(
        {
          status: "ok",
          service: identity.serviceName,
          environment: identity.environment,
          buildSha: identity.buildSha,
        },
        {
          headers: secureHeaders(new Headers({ "cache-control": "no-store" })),
        },
      );
    }
    if (url.pathname === "/runtime-config.js") return runtimeConfig(env);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyBackend(request, env);
    }

    const asset = await env.ASSETS.fetch(request);
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers: secureHeaders(new Headers(asset.headers)),
    });
  },
};
