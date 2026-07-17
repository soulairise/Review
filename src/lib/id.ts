import { randomBytes } from 'crypto';

// API 명세 §01: 접두어가 있는 문자열 ID.
// base62 (a-zA-Z0-9) 10자, 62^10 ≈ 8.4e17 (실용상 충돌 없음).

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    // Bytes are 0..255; modulo 62 has slight bias. 안전 트리 아님(랜덤 ID).
    // 완벽한 uniformity 가 필요하면 rejection sampling. 여기선 충분.
    out += BASE62[bytes[i]! % 62];
  }
  return out;
}

export const idFor = {
  user: () => 'usr_' + randomBase62(10),
  series: () => 'srs_' + randomBase62(10),
  episode: () => 'epi_' + randomBase62(10),
  post: () => 'pst_' + randomBase62(10),
  image: () => 'img_' + randomBase62(10),
  tag: () => 'tag_' + randomBase62(10),
  subscription: () => 'sub_' + randomBase62(10),
  tip: () => 'tip_' + randomBase62(10),
  comment: () => 'cmt_' + randomBase62(10),
  notification: () => 'ntf_' + randomBase62(10),
  report: () => 'rep_' + randomBase62(10),
  payout: () => 'pyt_' + randomBase62(10),
};

const PREFIX_RE = /^([a-z]{3})_[a-zA-Z0-9]{6,}$/;

export function isPrefixedId(prefix: string, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = PREFIX_RE.exec(value);
  return !!m && m[1] === prefix;
}
