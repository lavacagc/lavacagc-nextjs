/**
 * The Claude Code command lines for one queued SEO action, shown by the admin's
 * "Draft with Claude Code" button (RM3) in place of the retired AI drafter.
 *
 * Client-safe and pure, so a spec pins the exact commands.
 * The CLI is scripts/ingest-article.mjs (docs/articles-ingest.md).
 */
import { categoryForQuery } from '@/lib/seo/stageToBlog';

export interface CliAction {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_query: string | null;
  target_post_id: string | null;
  consolidate_into_id: string | null;
}

const CLI = 'node scripts/ingest-article.mjs';

/** Quote for a POSIX shell: single quotes, with any single quote closed and escaped. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A readable working title from the target query: "kitchen remodel cost nj" -> "Kitchen Remodel Cost NJ". */
function titleFromQuery(query: string | null): string {
  const q = (query ?? '').trim();
  if (!q) return 'New article';
  return q.replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // State abbreviations read as one word otherwise: "Nj" -> "NJ".
    .replace(/\b(Nj|Ny|Pa|Ct)\b/g, (s) => s.toUpperCase());
}

/**
 * The commands, in order, that draft this action with Claude Code and publish
 * it. `article.md` is the markdown Claude writes first; the publish line goes
 * through the publish guard.
 */
export function claudeCodeCommands(action: CliAction): string[] {
  const id = action.id;
  if (action.action_type === 'new') {
    return [
      `${CLI} create --action ${id} --title ${shellQuote(titleFromQuery(action.target_query))} `
        + `--category ${shellQuote(categoryForQuery(action.target_query))} --file article.md`,
      `${CLI} publish <post id printed above> --action ${id}`,
    ];
  }
  const postId = action.action_type === 'consolidate' ? action.consolidate_into_id : action.target_post_id;
  const target = postId ?? '<post id>';
  return [
    `${CLI} patch ${target} --action ${id} --file article.md`,
    `${CLI} publish ${target} --action ${id}`,
  ];
}

/** What to say to Claude Code, so the owner can paste one line instead of the commands. */
export function claudeCodePrompt(action: CliAction): string {
  const what = action.action_type === 'new'
    ? `write a new La Vaca article for the search query "${action.target_query ?? ''}"`
    : `${action.action_type} the article for "${action.target_query ?? ''}"`;
  return `Use the articles skill to ${what} (content action ${action.id}).`;
}
