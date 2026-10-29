'use client';

/**
 * Wraps an element rendered by withExperiment and reports it: one `view`
 * when it mounts, one `click` on the first press of a link or button inside.
 * The server already chose and rendered the variant; this only reports which.
 *
 * Renders a plain wrapper and sends nothing when `track` is false (a crawler,
 * an admin preview, a concluded experiment, no seed). The sink checks the
 * variant against the visitor's seed and the signed visitor id, so a forged
 * beacon cannot count for a variant the visitor was not shown.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { sendExperimentEvent } from './client';

export function ExperimentZone({
  experiment,
  className,
  children,
}: {
  experiment: { key: string; variant: string; track: boolean } | null;
  className?: string;
  children: ReactNode;
}) {
  const viewed = useRef(false);
  const clicked = useRef(false);
  const track = Boolean(experiment?.track);

  useEffect(() => {
    if (!track || !experiment || viewed.current) return;
    viewed.current = true;
    sendExperimentEvent({ event: 'view', experiment_key: experiment.key, variant_key: experiment.variant });
  }, [track, experiment]);

  const onActivate = (target: EventTarget | null) => {
    if (!track || !experiment || clicked.current) return;
    if (!(target instanceof Element) || !target.closest('a,button')) return;
    clicked.current = true;
    sendExperimentEvent({ event: 'click', experiment_key: experiment.key, variant_key: experiment.variant });
  };

  return (
    <div
      className={className}
      data-experiment={experiment?.key}
      data-experiment-variant={experiment?.variant}
      onPointerDown={(e) => onActivate(e.target)}
      // Keyboard activation (Enter on a link) fires click without pointerdown.
      onClick={(e) => onActivate(e.target)}
    >
      {children}
    </div>
  );
}
