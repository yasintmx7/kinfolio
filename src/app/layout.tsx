import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PortfolioProvider } from "@/components/providers/portfolio-provider";
import { ToastProvider } from "@/components/feedback/toast";
import { AppShell } from "@/components/navigation/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { APP_NAME } from "@/config/kintara";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Track trades, mining, and real profit`,
  description:
    "Paste Kintara buy/sell alerts, track inventory, weighted-average cost, realized and unrealized profit in KINS and USD. Local-first portfolio tool.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
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
  themeColor: "#070A12",
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
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ToastProvider>
          <PortfolioProvider>
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
