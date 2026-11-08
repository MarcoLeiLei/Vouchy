import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto max-w-[560px] px-4 pt-[max(env(safe-area-inset-top),16px)] pb-36">{children}</main>
      <BottomNav />
    </>
  );
}
