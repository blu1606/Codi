import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono, Lexend } from "next/font/google";

import "../index.css";
import Header from "@/components/header";
import HomeLogoIntro from "@/components/home-logo-intro";
import Providers from "@/components/providers";

const bodyFont = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  display: "swap",
});

const displayFont = Lexend({
  variable: "--font-lexend",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Codi",
  description: "Nền tảng học lập trình trực tuyến cá nhân hoá lộ trình bằng AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.21st.dev" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>
          <HomeLogoIntro />
          <div className="grid grid-rows-[auto_1fr] h-svh">
            <Header />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
