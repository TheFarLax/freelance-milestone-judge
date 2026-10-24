"use client";

import { usePathname } from "next/navigation";
import { formatAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Logo } from "@/components/ui/logo";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { classNames } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/create-milestone", label: "Create" },
  { href: "/submit-deliverable", label: "Submit" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { address, isConnected, connectWallet, disconnectWallet, isLoading } =
    useWallet();
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded-md transition-opacity hover:opacity-80"
            aria-label="Milestone Judge home"
          >
            <Logo />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={classNames(
                    "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600 sm:inline-block">
                  {formatAddress(address, 10)}
                </span>
                <Button variant="outline" size="sm" onClick={disconnectWallet}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={connectWallet} isLoading={isLoading}>
                Connect wallet
              </Button>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-200 px-4 pb-2 pt-1.5 sm:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={classNames(
                  "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-5 text-xs leading-5 text-slate-500 sm:px-6">
          <p>
            Evaluations run on the GenLayer Milestone Judge contract. A decision
            is the validators&rsquo; output for a submission, not a guarantee of
            correctness.
          </p>
        </div>
      </footer>
    </div>
  );
}
