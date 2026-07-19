import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PortfolioProvider } from "@/components/providers/portfolio-provider";
import { ThemeSync } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { AppShell } from "@/components/navigation/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { APP_NAME, APP_TAGLINE } from "@/config/kintara";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Kinfolio is a clean Kintara market tracker and profit calculator. Live floors, recent sales, break-even math, and local portfolio accounting.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/logo-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#060c14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ToastProvider>
          <PortfolioProvider>
            <ThemeSync />
            <RegisterServiceWorker />
            <div className="page-glow min-h-dvh">
              <AppShell>{children}</AppShell>
            </div>
          </PortfolioProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
