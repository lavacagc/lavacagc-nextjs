"use client";

import Link from "next/link";
import { ArrowUp, Home, Building2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "top" | "home" | "commercial" | "quote";

interface ServicesBottomTabsProps {
  active?: TabKey;
  /**
   * Where the Quote tab goes. Defaults to the /request-estimate form, which the
   * commercial pages still use. The home services pages point it at their own
   * in-page request flow instead (#services on the landing page, #request on a
   * service page), so a homeowner is never sent to the older form.
   */
  quoteHref?: string;
}

const TABS: Array<{ key: TabKey; href: string; label: string; Icon: typeof ArrowUp }> = [
  { key: "top", href: "#top", label: "Top", Icon: ArrowUp },
  { key: "home", href: "/home-services", label: "Home", Icon: Home },
  { key: "commercial", href: "/commercial-services", label: "Business", Icon: Building2 },
  { key: "quote", href: "/request-estimate", label: "Quote", Icon: ClipboardList },
];

export default function ServicesBottomTabs({ active, quoteHref }: ServicesBottomTabsProps) {
  return (
    <nav
      aria-label="Services navigation"
      className="lg:hidden fixed left-3 right-3 bottom-3 z-40 rounded-full border border-white/10 bg-secondary p-1.5 shadow-[0_18px_50px_-10px_rgba(0,40,85,0.45)]"
    >
      <div className="flex gap-1">
        {TABS.map(({ key, href: defaultHref, label, Icon }) => {
          const href = key === 'quote' && quoteHref ? quoteHref : defaultHref;
          const isActive = active === key;
          const Tag = href.startsWith("#") ? "a" : Link;
          return (
            <Tag
              key={key}
              href={href}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-full px-2 py-3 text-xs font-bold transition-all",
                isActive
                  ? "bg-gradient-to-br from-primary to-accent-tangerine text-white shadow-[0_6px_18px_-4px_rgba(238,150,57,0.45)]"
                  : "text-white/80 hover:text-white hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Tag>
          );
        })}
      </div>
    </nav>
  );
}
