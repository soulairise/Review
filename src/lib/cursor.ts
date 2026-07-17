// 커서 페이지네이션.
// opaque base64url({k: sortKeyValue, i: id}).
// 클라이언트는 문자열로만 취급.

export interface CursorPayload {
  /** 정렬 키 값 (숫자 or ISO 문자열) */
  k: string | number;
  /** tie-breaker: id */
  i: string;
}

export function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodeCursor(s: string | undefined | null): CursorPayload | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const k = (parsed as { k?: unknown }).k;
    const i = (parsed as { i?: unknown }).i;
    if ((typeof k !== 'string' && typeof k !== 'number') || typeof i !== 'string') return null;
    return { k, i };
  } catch {
    return null;
  }
}
