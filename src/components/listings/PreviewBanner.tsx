import { Eye } from 'lucide-react';

/**
 * Admin-only banner shown on the Buy + Remodel pages while the feature is
 * UNPUBLISHED. Signals that the public currently gets a 404 here and the page
 * is visible only because an admin (or local dev) is previewing it.
 */
export default function PreviewBanner() {
  return (
    <div className="bg-amber-400 text-amber-950 text-sm font-semibold">
      <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <Eye className="h-4 w-4 flex-shrink-0" />
        <span>
          Preview mode — “Buy + Remodel” isn’t published yet. Visitors see a 404. Publish it from the admin panel
          (Home Listings) when you’re ready.
        </span>
      </div>
    </div>
  );
}
