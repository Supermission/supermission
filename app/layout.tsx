import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { MobileNav } from '@/components/layout/mobile-nav';
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import { ChunkErrorReload } from "@/components/chunk-error-reload";
import { GoogleTranslateController } from "@/components/i18n/GoogleTranslateController";

const inter = localFont({
  src: "../public/fonts/BricolageGrotesque-VariableFont_opsz,wdth,wght.ttf",
  variable: "--font-inter",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "../public/fonts/MozillaHeadline-VariableFont_wdth,wght.ttf",
  variable: "--font-jetbrains-mono",
  display: "swap",
  fallback: ["Courier New", "monospace"],
});

const montserrat = localFont({
  src: "../public/fonts/MozillaHeadline-VariableFont_wdth,wght.ttf",
  variable: "--font-montserrat",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const bricolage = localFont({
  src: "../public/fonts/BricolageGrotesque-VariableFont_opsz,wdth,wght.ttf",
  variable: "--font-bricolage",
  display: "swap",
  fallback: ["Inter", "sans-serif"],
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "SUPERMISSION - AI-Powered DeFi Terminal",
  description: "The AI-powered DeFi terminal. One chat to swap tokens, provide liquidity, lend, earn yield, trade prediction markets, and analyze wallets. Zero gas fees.",
  keywords: ["DeFi", "AI trading", "Base", "Polygon", "Robinhood Chain", "DeFi terminal", "token swap", "yield farming", "prediction markets", "Uniswap", "Aave", "Morpho", "crypto trading"],
  authors: [{ name: "SUPERMISSION" }],
  creator: "SUPERMISSION",
  publisher: "SUPERMISSION",
  metadataBase: new URL('https://supermission.fun'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://supermission.fun',
    siteName: 'SUPERMISSION',
    title: 'SUPERMISSION - AI-Powered DeFi Terminal',
    description: 'The AI-powered DeFi terminal. One chat, every trade — swaps, LP, lending, yields, prediction markets.',
    images: [
      {
        url: 'https://supermission.fun/metatag.jpg',
        width: 1200,
        height: 630,
        alt: 'SUPERMISSION Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SUPERMISSION - AI-Powered DeFi Terminal',
    description: 'One chat, every trade. Swap, lend, LP, earn yield, trade prediction markets.',
    images: ['https://supermission.fun/metatag.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.json',
  other: {
    'virtual-protocol-site-verification': 'e06e9833162bea545c4ffce9f6938df9',
    'fc:miniapp': JSON.stringify({
      version: 'next',
      imageUrl: 'https://supermission.fun/metatag.jpg',
      button: {
        title: 'Launch SUPERMISSION',
        action: {
          type: 'launch_miniapp',
          name: 'SUPERMISSION',
          url: 'https://supermission.fun',
          splashImageUrl: 'https://supermission.fun/metatag.jpg',
          splashBackgroundColor: '#FFFFFF',
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${montserrat.variable} ${bricolage.variable} font-sans`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=location.pathname;var m=p==='/'||p==='/how-it-works'||p==='/faq'||p==='/terms'||p==='/privacy'||p==='/mission'||p.indexOf('/blog')===0||p.indexOf('/mission')===0;if(!m)return;var r=document.documentElement;r.classList.add('site-theme-scope');var pref=localStorage.getItem('sm:site-theme-pref');if(!pref){pref=localStorage.getItem('sm:site-dark-mode')==='1'?'dark':'system';}var dark=pref==='dark'||(pref==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark){r.classList.add('dark');r.style.colorScheme='dark';}}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://worker.supermission.fun" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://polymarket-upload.s3.us-east-2.amazonaws.com" crossOrigin="anonymous" />
        <link rel="llms-txt" href="https://supermission.fun/llms.txt" />
        <link rel="llms-full-txt" href="https://supermission.fun/llms-full.txt" />
        <link rel="agent" href="https://supermission.fun/.well-known/agent.json" />
      </head>
      <body className="antialiased">
        <ChunkErrorReload />
        <Providers>
          {children}
          <MobileNav />
          <GoogleTranslateController />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
