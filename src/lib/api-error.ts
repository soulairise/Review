import { NextResponse } from 'next/server';

// API 명세 §01: 통일된 에러 응답 스키마.
// { error: { code, message, details? } }
export type ErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'rate_limited'
  | 'too_many_attempts'
  | 'invalid_credentials'
  | 'internal_error'
  | 'not_implemented';

export interface ErrorDetails {
  fields?: Record<string, string>;
  [k: string]: unknown;
}

export class APIError extends Error {
  status: number;
  code: ErrorCode;
  details?: ErrorDetails;

  constructor(status: number, code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// 흔한 케이스 헬퍼
export const badRequest = (msg: string, details?: ErrorDetails) =>
  new APIError(400, 'invalid_request', msg, details);
export const unauthorized = (msg = '로그인이 필요합니다.') =>
  new APIError(401, 'unauthorized', msg);
export const forbidden = (msg = '권한이 없습니다.', details?: ErrorDetails) =>
  new APIError(403, 'forbidden', msg, details);
export const notFound = (msg = '리소스를 찾을 수 없습니다.') =>
  new APIError(404, 'not_found', msg);
export const conflict = (msg: string, details?: ErrorDetails) =>
  new APIError(409, 'conflict', msg, details);
export const validationFailed = (details: ErrorDetails, msg = '요청 값이 올바르지 않습니다.') =>
  new APIError(422, 'validation_failed', msg, details);
export const rateLimited = (msg = '요청이 너무 많습니다.', retryAfterSec?: number) => {
  const err = new APIError(429, 'rate_limited', msg);
  if (retryAfterSec != null) (err.details = { ...(err.details || {}), retry_after: retryAfterSec });
  return err;
};

// JSON 응답 헬퍼
export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    status: 200,
    ...init,
  });
}

export function jsonCreated<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    status: 201,
    ...init,
  });
}

export function jsonNoContent(init?: ResponseInit) {
  return new NextResponse(null, { status: 204, ...init });
}

// APIError → JSON 응답
export function jsonError(err: unknown) {
  if (err instanceof APIError) {
    const body: {
      error: { code: string; message: string; details?: ErrorDetails };
    } = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;

    const headers: HeadersInit = {};
    if (err.status === 429 && err.details?.retry_after) {
      headers['Retry-After'] = String(err.details.retry_after);
    }
    return NextResponse.json(body, { status: err.status, headers });
  }
  // 알 수 없는 에러 → 500 + 세부 정보는 서버 로그에만
  console.error('[unhandled]', err);
  return NextResponse.json(
    { error: { code: 'internal_error', message: '서버 오류가 발생했습니다.' } },
    { status: 500 }
  );
}

// 라우트 핸들러 wrapper: try/catch 를 매번 쓰지 않도록
export function withErrors<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return jsonError(err);
    }
  };
}
