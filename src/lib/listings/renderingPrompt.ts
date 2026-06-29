/**
 * Prompt builder for the before→after remodel renderings (Gemini image edit).
 * The goal is an "after" that keeps the EXACT camera angle/composition of the
 * uploaded "before" photo and only changes finishes/fixtures.
 */
import { sectionLabel } from '@/lib/listings/columns';

const SECTION_UPGRADES: Record<string, string> = {
  kitchen:
    'new cabinetry, quartz or stone countertops, a tile backsplash, modern stainless or panel-ready appliances, updated lighting, and refreshed flooring',
  bathroom:
    'a new vanity, updated tile on floors and walls, a modern shower or tub, new fixtures and mirror, and improved lighting',
  'living-room':
    'refinished or new flooring, fresh paint, updated trim and millwork, a refreshed fireplace or feature wall, and layered modern lighting',
  exterior:
    'refreshed siding or facade, new paint, a modern front door, clean landscaping, and updated exterior lighting',
  basement:
    'fully finished walls and ceiling, new flooring, recessed lighting, and a bright, livable finished-space feel',
};

const DEFAULT_STYLE = 'modern transitional';

/** Build the remodel edit prompt for a section + optional style. */
export function buildRemodelPrompt(section: string, style?: string | null): string {
  const label = sectionLabel(section).toLowerCase();
  const upgrades = SECTION_UPGRADES[section] ?? 'updated finishes, fixtures, surfaces, and lighting';
  const styleText = (style && style.trim()) || DEFAULT_STYLE;

  return [
    `Photorealistically renovate this ${label} into a high-end, professionally remodeled space.`,
    `CRITICAL: keep the exact same camera angle, perspective, framing, focal length, and room dimensions as the input photo.`,
    `Do not move, add, or remove walls, windows, doors, or major structural elements — keep their positions and sizes identical.`,
    `Renovate only the finishes and fixtures: ${upgrades}.`,
    `Style: ${styleText}, by a premium contractor. Realistic daylight, clean and tidy, no people, no text, no watermarks, no labels.`,
    `Return a single edited image of the same view, after the remodel.`,
  ].join(' ');
}
