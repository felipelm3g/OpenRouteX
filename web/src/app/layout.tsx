import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';

import { Providers } from '@/components/providers';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const title = 'OpenRouteX';
  const description =
    'OpenRouteX: API Gateway self-hosted, Docker-first, com roteamento dinâmico e variáveis por API Key.';
  const icon = '/favicon_OpenRouteX.png';
  const previewImage = '/favicon_OpenRouteX.png';

  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').trim();
  const proto = (h.get('x-forwarded-proto') ?? 'https').trim();
  const metadataBase = host ? new URL(`${proto}://${host}`) : undefined;

  return {
    metadataBase,
    title,
    description,
    icons: {
      icon,
      apple: icon,
      shortcut: icon,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: previewImage }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [previewImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
