"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  X,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Droplets,
  DoorOpen,
  CloudLightning,
  FileText,
  PaintBucket,
  Tag,
  ListChecks,
  Hammer,
  KeyRound,
  Store,
  ClipboardCheck,
  Camera,
  Siren,
  Footprints,
  type LucideIcon,
} from "lucide-react";
import type { ServiceEntry, ServiceIconKey } from "./serviceData";

const ICON_MAP: Record<ServiceIconKey, LucideIcon> = {
  "shield-check": ShieldCheck,
  droplets: Droplets,
  "door-open": DoorOpen,
  "cloud-lightning": CloudLightning,
  "file-text": FileText,
  "paint-bucket": PaintBucket,
  tag: Tag,
  "list-checks": ListChecks,
  hammer: Hammer,
  "key-round": KeyRound,
  store: Store,
  "clipboard-check": ClipboardCheck,
  camera: Camera,
  siren: Siren,
  footprints: Footprints,
};

interface ServiceTileProps {
  service: ServiceEntry;
}

export default function ServiceTile({ service }: ServiceTileProps) {
  const [open, setOpen] = useState(false);
  const Icon = ICON_MAP[service.icon];

  return (
    <>
      <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-[3px] hover:border-primary/30 hover:shadow-elegant">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent-tangerine/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>

        <h3 className="mb-2 text-lg font-extrabold leading-tight tracking-tight text-text-primary">
          {service.title}
        </h3>

        <span className="mb-3 w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-primary">
          {service.badge}
        </span>

        <p className="mb-4 text-sm leading-relaxed text-text-muted">{service.shortDesc}</p>

        <div className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-accent-teal">
              <Check className="h-3 w-3" /> Includes
            </h4>
            <ul className="space-y-1 text-xs leading-snug text-text-secondary">
              {service.inc.slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
              <X className="h-3 w-3" /> Not included
            </h4>
            <ul className="space-y-1 text-xs leading-snug text-text-muted">
              {service.exc.slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background-soft px-3.5 py-2.5 text-xs font-bold text-text-secondary transition-all hover:-translate-y-[1px] hover:border-primary/40 hover:bg-card hover:text-primary"
          aria-haspopup="dialog"
        >
          <span>View full coverage</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden sm:rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3 border-b border-border bg-gradient-to-b from-background-soft to-card p-6 sm:p-8 text-left">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/18 to-accent-tangerine/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <span className="inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-primary">
              {service.badge}
            </span>
            <DialogTitle className="text-2xl font-extrabold leading-tight tracking-tight text-text-primary pr-8">
              {service.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-text-secondary max-w-prose">
              {service.blurb}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="p-6 sm:p-7">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-accent-teal">
                <CheckCircle2 className="h-4 w-4" /> What&apos;s covered
              </h3>
              <ul className="space-y-2.5">
                {service.inc.map((item) => (
                  <li key={item} className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug text-text-primary">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-teal/15">
                      <Check className="h-3 w-3 text-accent-teal" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border p-6 sm:border-l sm:border-t-0 sm:p-7">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">
                <XCircle className="h-4 w-4" /> Not covered
              </h3>
              <ul className="space-y-2.5">
                {service.exc.map((item) => (
                  <li key={item} className="grid grid-cols-[18px_1fr] items-start gap-2.5 text-[15px] leading-snug text-text-secondary">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/15">
                      <X className="h-3 w-3 text-text-muted" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background-soft p-6">
            <p className="flex-1 min-w-[240px] text-xs leading-relaxed text-text-muted m-0">
              Scope summary — final scope confirmed in writing after a photos / site review. Specialty trade work is coordinated separately.
            </p>
            <Link
              href="/request-estimate"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-5 py-3 text-sm font-bold text-white shadow-button transition-transform hover:-translate-y-[1px]"
            >
              Request this service
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
