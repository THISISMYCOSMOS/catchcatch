const CORE_INTERNAL_BASE_URL = (process.env.CORE_INTERNAL_BASE_URL ?? "http://127.0.0.1:3002")
  .replace(/\/$/, "");

const REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "x-request-id",
] as const;

const RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "location",
  "www-authenticate",
  "x-request-id",
] as const;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}

async function forward(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const sourceUrl = new URL(request.url);
  const encodedPath = path.map(encodeURIComponent).join("/");
  const targetUrl = new URL(`/api/v1/${encodedPath}${sourceUrl.search}`, CORE_INTERNAL_BASE_URL);
  const headers = new Headers();

  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    const responseHeaders = new Headers();

    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    copySetCookieHeaders(upstream.headers, responseHeaders);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      {
        code: "CORE_UNAVAILABLE",
        message: "분석 서비스에 연결할 수 없습니다.",
      },
      { status: 502 },
    );
  }
}

function copySetCookieHeaders(source: Headers, destination: Headers): void {
  const withGetSetCookie = source as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie?.();
  if (cookies?.length) {
    for (const cookie of cookies) destination.append("set-cookie", cookie);
    return;
  }

  const cookie = source.get("set-cookie");
  if (cookie !== null) destination.append("set-cookie", cookie);
}
