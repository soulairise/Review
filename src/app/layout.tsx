import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '짓다 · JITDA — 웹툰 오픈 플랫폼',
  description: '누구나 그리고, 누구나 만나는 웹툰 오픈 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
