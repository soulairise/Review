import { hash, verify, Algorithm } from '@node-rs/argon2';
import { createHash } from 'crypto';

// 보안 명세 §3.2 — Argon2id.
// 이 파라미터는 OWASP 2024 권장. 서버 CPU 에서 목표 시간 ~500ms.
const HASH_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(raw: string): Promise<string> {
  return hash(raw, HASH_OPTS);
}

export async function verifyPassword(raw: string, hashed: string): Promise<boolean> {
  try {
    return await verify(hashed, raw, HASH_OPTS);
  } catch {
    return false;
  }
}

// 존재하지 않는 계정에 대해서도 실 해싱과 유사한 CPU 시간을 소비.
// 로그인 응답 시간으로 계정 존재 여부가 유출되는 걸 막는다 (§3.6 timing attack 방어).
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$D93o2S4wIzXyIS42T1uH0YbG3ZQZbA5r7QYw3n0hOoY';
export async function burnCpuLikeAVerify(raw: string): Promise<void> {
  try { await verify(DUMMY_HASH, raw, HASH_OPTS); } catch { /* noop */ }
}

// 흔한 패스워드 사전 (프로덕션은 zxcvbn-ts + HIBP k-anonymity API 로 교체)
const COMMON = new Set<string>([
  'password', 'passw0rd', 'p@ssword', 'p@ssw0rd', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome',
  'admin', 'password123', 'iloveyou', '111111', 'monkey', 'dragon',
  'sunshine', 'football', 'baseball', 'zaq12wsx', 'qazwsx',
]);

export interface StrengthCheckContext {
  email?: string;
  handle?: string;
  displayName?: string;
}

export function checkPasswordStrength(
  pw: string,
  ctx: StrengthCheckContext = {}
): { ok: boolean; reason?: string } {
  if (pw.length < 10) return { ok: false, reason: '10자 이상이어야 합니다.' };
  if (pw.length > 128) return { ok: false, reason: '128자를 넘을 수 없습니다.' };

  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return { ok: false, reason: '너무 흔한 비밀번호입니다.' };
  for (const c of COMMON) {
    if (c.length >= 6 && lower.includes(c)) return { ok: false, reason: '흔한 패턴을 포함합니다.' };
  }

  // 반복·시퀀스
  if (/^(.)\1+$/.test(pw)) return { ok: false, reason: '단일 문자 반복만으로는 안 됩니다.' };
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pw))
    return { ok: false, reason: '연속된 문자·숫자 패턴이 감지되었습니다.' };

  // 사용자 정보 포함 금지
  for (const v of [ctx.email, ctx.handle, ctx.displayName]) {
    if (!v) continue;
    const s = v.toLowerCase().trim();
    if (s.length >= 3 && lower.includes(s)) return { ok: false, reason: '이메일·이름·핸들을 포함할 수 없습니다.' };
    if (s.length >= 3 && s.includes('@')) {
      const local = s.split('@')[0]!;
      if (local.length >= 3 && lower.includes(local))
        return { ok: false, reason: '이메일을 포함할 수 없습니다.' };
    }
  }

  // 문자 클래스 다양성
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  const alphabet =
    (/[a-z]/.test(pw) ? 26 : 0) +
    (/[A-Z]/.test(pw) ? 26 : 0) +
    (/\d/.test(pw) ? 10 : 0) +
    (/[^a-zA-Z0-9]/.test(pw) ? 32 : 0);
  const bits = Math.log2(Math.max(alphabet, 2)) * pw.length;

  // 대략 zxcvbn score 3 수준 = 55 bits 이상 & 최소 2개 클래스
  if (bits < 55 || classes < 2) {
    return { ok: false, reason: '더 강한 비밀번호가 필요합니다.' };
  }
  return { ok: true };
}

// SHA-256 해시 (토큰·이메일 인덱스 등 원문 저장 안 하는 곳에 사용)
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
