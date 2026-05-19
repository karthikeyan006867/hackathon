import type { Metadata } from "next";
import { Oxanium, Space_Grotesk } from "next/font/google";
import "./globals.css";

const displayFont = Oxanium({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SafeSphere AI | Intelligent Industrial Safety Auditor",
  description:
    "ANN-powered multimodal workspace safety, hazard, and compliance dashboard with structured JSON analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#070b12" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
