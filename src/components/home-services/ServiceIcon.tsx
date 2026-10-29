import { CloudRain, Fan, Hammer, House, PaintRoller, Sparkles, Wind, type LucideIcon } from 'lucide-react';
import type { HomeService } from '@/lib/home-services/catalog';

const ICONS: Record<HomeService['icon'], LucideIcon> = {
  'paint-roller': PaintRoller,
  fan: Fan,
  wind: Wind,
  sparkles: Sparkles,
  house: House,
  'cloud-rain': CloudRain,
  hammer: Hammer,
};

/** The catalog's icon panel (no photography exists for these services yet; audit C12). */
export default function ServiceIcon({ icon, className }: { icon: HomeService['icon']; className?: string }) {
  const Icon = ICONS[icon] ?? House;
  return <Icon aria-hidden className={className} />;
}
