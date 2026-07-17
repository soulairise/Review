import { z } from 'zod';
import { zEmail, zHandle, zDisplayName, zPassword } from './common';

export const SignupSchema = z.object({
  email: zEmail,
  password: zPassword,
  display_name: zDisplayName,
  handle: zHandle,
});
export type SignupBody = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: zEmail,
  password: z.string().min(1).max(128), // 로그인 시엔 형식만
});
export type LoginBody = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refresh_token: z.string().optional(), // 쿠키가 우선, body는 fallback
});

export const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
});

export const PasswordResetRequestSchema = z.object({
  email: zEmail,
});

export const PasswordResetConfirmSchema = z.object({
  reset_token: z.string().min(20).max(200),
  new_password: zPassword,
});
