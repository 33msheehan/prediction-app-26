import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthButton } from "@/components/AuthButton";
import { Nav } from "@/components/Nav";
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
  title: "Forecast Workbench",
  description: "Personal probabilistic forecasting workbench",
};

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
        <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10">
          <Nav />
          <div className="px-6">
            <AuthButton />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
