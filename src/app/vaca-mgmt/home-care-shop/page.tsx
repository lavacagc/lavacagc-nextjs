'use client';

/**
 * Customers -> Home Care Shop.
 *
 * A route of its own as well as an admin tab, matching the pattern the
 * proposals and home-records screens already use: AdminContent dynamic-imports
 * this page into its tab, and the URL stays available for a direct link.
 */
import { HomeCareShopManager } from '@/components/admin/HomeCareShopManager';

export default function HomeCareShopPage() {
  return <HomeCareShopManager />;
}
