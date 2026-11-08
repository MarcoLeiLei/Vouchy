"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Camera, Settings, Trophy } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Kiste", icon: Archive },
  { href: "/erfolge", label: "Erfolge", icon: Trophy },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function BottomNav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-paper/90 backdrop-blur border-t-2 border-line"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      aria-label="Hauptnavigation"
    >
      <div className="mx-auto max-w-[560px] grid grid-cols-4 items-end px-2 pt-2">
        {ITEMS.slice(0, 1).map((it) => (
          <NavItem key={it.href} {...it} active={isActive(it.href)} />
        ))}
        <Link href="/neu" className="press flex flex-col items-center -mt-7" aria-label="Gutschein hinzufügen">
          <span className="grid place-items-center w-16 h-16 rounded-[22px] bg-pink text-white shadow-[0_4px_0_#2b1b63] rotate-[-6deg]">
            <Camera size={28} strokeWidth={2.4} />
          </span>
          <span className="text-xs font-semibold mt-1.5">Hinzufügen</span>
        </Link>
        {ITEMS.slice(1).map((it) => (
          <NavItem key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Archive; active: boolean }) {
  return (
    <Link href={href} className={`press flex flex-col items-center gap-0.5 py-1 ${active ? "text-ink" : "text-ink-soft/70"}`} aria-current={active ? "page" : undefined}>
      <Icon size={24} strokeWidth={active ? 2.6 : 2} />
      <span className={`text-xs ${active ? "font-bold" : "font-medium"}`}>{label}</span>
    </Link>
  );
}
