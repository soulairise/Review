import { z } from 'zod';

// 보안 명세 §5.4: 필드별 상한.
// UX 는 프론트에서, 최종 검증은 여기서.

// 이메일 — RFC 5321 상한 254자. 대소문자·공백 정규화.
export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, '이메일이 너무 깁니다.')
  .email('올바른 이메일이 아닙니다.');

// Handle — [a-z0-9_]{3,20}
export const zHandle = z
  .string()
  .min(3, '3자 이상이어야 합니다.')
  .max(20, '20자를 넘을 수 없습니다.')
  .regex(/^[a-z0-9_]+$/, '소문자·숫자·언더스코어만 가능합니다.');

// 필명 — 1~30자, 제어 문자 금지
export const zDisplayName = z
  .string()
  .trim()
  .min(1, '한 글자 이상 입력해주세요.')
  .max(30, '30자를 넘을 수 없습니다.')
  .refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v), '제어 문자는 사용할 수 없습니다.');

// 비밀번호 — 10~128자 (강도 검증은 별도)
export const zPassword = z
  .string()
  .min(10, '10자 이상이어야 합니다.')
  .max(128, '128자를 넘을 수 없습니다.');

// 접두어 있는 ID
export const zPrefixedId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9]{6,}$`), 'ID 형식이 올바르지 않습니다.');

// 페이지네이션 쿼리
export const zPagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// 통화 (Phase 1: KRW)
export const zCurrency = z.enum(['KRW', 'USD']);

// 뷰어 모드
export const zViewerMode = z.enum(['scroll', 'page']);

// 이미지 목록 (회차·포스트 생성 시)
export const zImageIds = z.array(zPrefixedId('img')).max(50, '이미지는 최대 50장까지 가능합니다.');

// 마크다운 텍스트 (렌더 전 sanitize)
export const zLongText = (max = 2000) =>
  z.string().max(max).refine((v) => !/[\p{Cc}\p{Cf}]/u.test(v.replace(/[\r\n\t]/g, '')),
    '허용되지 않은 제어 문자가 포함되어 있습니다.');

// 태그 배열
export const zTags = z.array(
  z.string().min(1).max(20).regex(/^[^\s#]+$/, '태그에 공백·# 은 사용할 수 없습니다.')
).max(10, '태그는 최대 10개까지 가능합니다.');

// Zod 에러를 API 명세 형식(fields 맵)으로 변환
export function zodErrorToFields(err: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
