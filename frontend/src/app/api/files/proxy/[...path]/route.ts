import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.atlas.tn/api/v1";

export const dynamic = "force-dynamic";

function buildBackendUrl(pathSegments: string[]) {
  const normalizedPath = pathSegments
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${API_BASE_URL.replace(/\/$/, "")}/files/proxy/${normalizedPath}`;
}

async function forwardFileRequest(
  request: NextRequest,
  pathSegments: string[],
) {
  // Access headers from NextRequest - headers are lowercase in NextRequest
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");

  const headers: Record<string, string> = {};

  // Handle Authorization header (forward as-is, already has Bearer prefix from client)
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  // Forward cookies for session-based auth
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  const backendUrl = buildBackendUrl(pathSegments);
  console.log(`[Proxy] Forwarding to: ${backendUrl}`);
  console.log(`[Proxy] Has auth header: ${!!authHeader}`);
  console.log(`[Proxy] Auth header preview: ${authHeader?.substring(0, 50)}...`);

  const upstreamResponse = await fetch(backendUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  console.log(`[Proxy] Backend response: ${upstreamResponse.status}`);

  // For error responses, forward status without buffering
  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text().catch(() => "");
    console.log(`[Proxy] Backend error body: ${errorBody.substring(0, 200)}`);
    return new NextResponse(errorBody, {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Buffer the entire response body to avoid stream-consumption issues
  // (React Strict Mode double-mounts can abort in-flight streams, and
  //  NextResponse passthrough of ReadableStream can produce empty bodies
  //  when the upstream is a Python StreamingResponse.)
  const arrayBuffer = await upstreamResponse.arrayBuffer();
  console.log(`[Proxy] Buffered ${arrayBuffer.byteLength} bytes`);

  const responseHeaders = new Headers();
  const passthroughHeaders = [
    "content-type",
    "content-disposition",
    "cache-control",
    "etag",
    "last-modified",
  ];

  for (const headerName of passthroughHeaders) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) {
      responseHeaders.set(headerName, value);
    }
  }

  // Set the actual buffered length (upstream content-length may differ or be absent)
  responseHeaders.set("content-length", String(arrayBuffer.byteLength));

  return new NextResponse(arrayBuffer, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> | { path: string[] } },
) {
  const { path } = await Promise.resolve(context.params);
  return forwardFileRequest(request, path);
}
