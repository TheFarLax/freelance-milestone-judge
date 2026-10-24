import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Milestone Judge — Freelance delivery evaluation on GenLayer",
  description:
    "Create freelance milestones, submit deliverables, and read validator-backed verdicts from a GenLayer Intelligent Contract.",
  applicationName: "Milestone Judge",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </WalletProvider>
      </body>
    </html>
  );
}
