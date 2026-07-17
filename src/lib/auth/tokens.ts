import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';
import { sha256 } from './password';

const encoder = new TextEncoder();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다.`);
  return v;
}

const ACCESS_SECRET = () => encoder.encode(requireEnv('JWT_ACCESS_SECRET'));
const ISSUER = () => process.env.JWT_ISSUER ?? 'jitda';

export const ACCESS_TOKEN_TTL_SEC = 60 * 60;                 // 1시간
export const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30;      // 30일

export interface AccessTokenClaims {
  sub: string;         // user id
  role: 'USER' | 'ADMIN';
  handle: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return await new SignJWT({ role: claims.role, handle: claims.handle })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(ACCESS_SECRET());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET(), { issuer: ISSUER() });
  if (typeof payload.sub !== 'string') throw new Error('sub missing');
  if (payload.role !== 'USER' && payload.role !== 'ADMIN') throw new Error('role missing');
  if (typeof payload.handle !== 'string') throw new Error('handle missing');
  return { sub: payload.sub, role: payload.role, handle: payload.handle };
}

// Refresh token 은 JWT 가 아닌 불투명 랜덤 토큰 (256bit).
// 서버는 hash 만 저장. 원문은 응답 후 절대 저장·로깅하지 않는다.
export interface RefreshTokenIssue {
  raw: string;         // 클라이언트에게 쿠키로 세팅
  hash: string;        // DB 저장용
}

export function issueRefreshToken(): RefreshTokenIssue {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: sha256(raw) };
}

export function hashRefreshToken(raw: string): string {
  return sha256(raw);
}
