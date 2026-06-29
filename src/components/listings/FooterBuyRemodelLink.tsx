'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useBuyRemodelPublished } from '@/lib/listings/publishedClient';

/**
 * Footer link to Buy + Remodel, shown only once the feature is published (or to
 * a logged-in admin). A small client island so the server-rendered Footer stays
 * static. Link visibility only — access is enforced server-side.
 */
export default function FooterBuyRemodelLink() {
  const { session } = useAuth();
  const published = useBuyRemodelPublished();
  if (!published && !session) return null;
  return (
    <li>
      <Link href="/buy-and-remodel" className="hover:text-primary transition-colors">
        Buy + Remodel
      </Link>
    </li>
  );
}
