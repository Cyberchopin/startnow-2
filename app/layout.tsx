import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Start Now — One Honest Start",
  description: "A 60-second activation coach that turns overwhelm into one physically startable action.",
  openGraph: {
    title: "Start Now — One Honest Start",
    description: "Turn overwhelm into one physically startable action.",
    images: ["/start-now-product.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Start Now — One Honest Start",
    description: "Turn overwhelm into one physically startable action.",
    images: ["/start-now-product.jpg"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
