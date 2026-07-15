import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  source?: string;
  updatedAt?: string;
  stale?: boolean;
  cached?: boolean;
};

export type ApiFailure = {
  ok: false;
  error: { code: string; message: string };
  retryable: boolean;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(
  data: T,
  init?: {
    source?: string;
    updatedAt?: string;
    stale?: boolean;
    cached?: boolean;
    status?: number;
    cacheControl?: string;
  },
) {
  const body: ApiSuccess<T> = {
    ok: true,
    data,
    source: init?.source,
    updatedAt: init?.updatedAt,
    stale: init?.stale,
    cached: init?.cached,
  };
  const headers: HeadersInit = {};
  if (init?.cacheControl) headers["Cache-Control"] = init.cacheControl;
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

export function fail(
  code: string,
  message: string,
  options?: { status?: number; retryable?: boolean },
) {
  const body: ApiFailure = {
    ok: false,
    error: { code, message },
    retryable: options?.retryable ?? false,
  };
  return NextResponse.json(body, { status: options?.status ?? 400 });
}
