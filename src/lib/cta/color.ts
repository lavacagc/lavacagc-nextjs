/**
 * `cta_variants.color` is either a hex colour or a Tailwind class list.
 *
 * Hex is the reliable form: it is applied as an inline background. A class list
 * only works for classes that already exist in the compiled CSS (Tailwind
 * generates classes it finds in source, not in the database), which is why the
 * admin editor offers a hex picker and documents the limitation.
 */
import type { CSSProperties } from 'react';

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Conservative: letters, digits and the punctuation Tailwind classes use. */
export const CLASS_LIST = /^[a-z0-9:/\-_. [\]#]+$/i;

export function isValidCtaColor(value: string): boolean {
  return HEX_COLOR.test(value) || CLASS_LIST.test(value);
}

export interface CtaColorStyle {
  /** Classes to use INSTEAD of the default gradient, when a class list is set. */
  className?: string;
  style?: CSSProperties;
}

/** null means "keep the default look". */
export function ctaColorStyle(color: string | null | undefined): CtaColorStyle | null {
  const value = color?.trim();
  if (!value) return null;
  if (HEX_COLOR.test(value)) return { style: { backgroundColor: value, backgroundImage: 'none', borderColor: value } };
  if (CLASS_LIST.test(value)) return { className: value };
  return null;
}
