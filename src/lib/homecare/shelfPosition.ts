/**
 * Where a swiping DIY Kit shelf is, as its slider bar and counter show it.
 *
 * Pure and separate from `DiyKitShelf` on purpose. This is the most intricate
 * arithmetic in the feature and the only part of it a member notices when it is
 * wrong - a counter that says "2 - 3 of 4" while the fourth card is on screen
 * reads as a bug in the shelf. Inside the component it could only be checked by
 * matching strings in the source, which a rename would satisfy while the
 * arithmetic regressed; out here it can be handed real numbers from a real
 * browser layout and asked what it answers.
 *
 * Nothing here touches the DOM: the component reads the four measurements off
 * the scroller and this decides what they mean.
 */

/** The gap between two cards, matching the shelf's own `gap-2.5`. */
export const SHELF_GAP = 9;

export interface ShelfMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  /** The first card's rendered width; the caller falls back to clientWidth when there is no card. */
  cardWidth: number;
  /** How many products are on the shelf. */
  count: number;
}

export interface ShelfPosition {
  /** The drawn slider bar, in percentages of the track. */
  thumb: { left: number; width: number };
  /** Which cards are on screen, 1-based and inclusive. */
  range: { first: number; last: number };
}

export function shelfPosition({
  scrollLeft, scrollWidth, clientWidth, cardWidth, count,
}: ShelfMetrics): ShelfPosition {
  if (count <= 0) return { thumb: { left: 0, width: 100 }, range: { first: 1, last: 1 } };

  const visibleFraction = scrollWidth > 0 ? Math.min(1, clientWidth / scrollWidth) : 1;
  const maxScroll = Math.max(1, scrollWidth - clientWidth);
  const progress = Math.min(1, Math.max(0, scrollLeft / maxScroll));
  const width = visibleFraction * 100;

  const step = Math.max(1, cardWidth + SHELF_GAP);
  const perView = Math.max(1, Math.round(clientWidth / step));
  // Counted from the RIGHT edge, and pinned to the end when the scroll is
  // there. Counting from the left with a floor is off by one at the end: the
  // final scroll position does not land on a card boundary, so a shelf swiped
  // all the way right still read "2 - 3 of 4" while showing the fourth card.
  const atEnd = scrollLeft >= scrollWidth - clientWidth - 1;
  const last = atEnd
    ? count
    : Math.min(count, Math.max(1, Math.round((scrollLeft + clientWidth) / step)));

  return {
    thumb: { width, left: progress * (100 - width) },
    range: { first: Math.max(1, last - perView + 1), last },
  };
}

/** "1 - 2", or just "3" when a single card fills the view. The counter's " of N" is the shelf's. */
export function shelfRangeLabel({ first, last }: ShelfPosition['range']): string {
  return last > first ? `${first} - ${last}` : `${first}`;
}
