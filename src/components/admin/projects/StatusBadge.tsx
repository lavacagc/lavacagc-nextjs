import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProjectStatus } from '@/lib/projects/fields';

const STYLES: Record<ProjectStatus, string> = {
  draft: 'bg-amber-100 text-amber-900 border-amber-300',
  published: 'bg-green-100 text-green-900 border-green-300',
  archived: 'bg-gray-100 text-gray-800 border-gray-300',
};
const LABEL: Record<ProjectStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' };

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', STYLES[status], className)} data-testid="project-status">
      {LABEL[status]}
    </Badge>
  );
}
