/**
 * The one-tap unpublish page, as a complete HTML document.
 *
 * It is served by a route handler (src/app/articles/unpublish/[token]/route.ts)
 * rather than an App Router page because the contract asks for a real 410 on
 * a dead link, and a page cannot set its own status. It is also deliberately
 * outside the site layout: no analytics, no chat widget, no banners, nothing
 * but the post and one button (the /offer/[token] rule, without the widgets
 * to switch off).
 *
 * The button is a plain HTML form POST to /api/articles/unpublish/<token>, so
 * it works in Telegram's in-app browser with no JavaScript, and a link
 * previewer that GETs the URL changes nothing (TG3).
 *
 * Pure: tests/articles-publish-guard.spec.ts renders it directly.
 */

export type UnpublishView =
  | { kind: 'confirm'; title: string; slug: string; postUrl: string; action: string }
  | { kind: 'done'; title: string; slug: string; adminUrl: string }
  | { kind: 'gone'; adminUrl: string }
  | { kind: 'error'; adminUrl: string };

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLE = `
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;min-height:100vh;background:#EFEBE6;color:#1A1A1A;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:32px 16px}
  main{max-width:28rem;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:24px}
  .brand{margin:0 0 16px;font-size:14px;font-weight:700}
  .brand span{font-weight:400;color:#666}
  h1{margin:0;font-size:20px;line-height:1.3}
  p{margin:8px 0 0;font-size:14px;color:#444}
  dl{margin:20px 0 0;border-top:1px solid #EEE7DF}
  .row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #EEE7DF}
  dt{width:4.5rem;flex-shrink:0;font-size:12px;font-weight:700;color:#666;padding-top:2px}
  dd{margin:0;min-width:0;font-size:14px;overflow-wrap:anywhere}
  a{color:#9A510C}
  form{margin:24px 0 0}
  button{display:block;width:100%;border:0;border-radius:8px;background:#B4600F;color:#fff;font:inherit;font-weight:700;padding:14px 20px;cursor:pointer}
  button:hover{background:#9A510C}
  button:focus-visible{outline:2px solid #B4600F;outline-offset:2px}
  .note{margin-top:12px;font-size:12px;color:#666}
  @media (min-width:640px){main{padding:32px}}
`;

function documentFor(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(heading)} | La Vaca</title>
<style>${STYLE}</style>
</head>
<body>
<main id="main-content">
<p class="brand">La Vaca <span>General Contractors</span></p>
${body}
</main>
</body>
</html>`;
}

function postRows(title: string, slug: string, postUrl?: string): string {
  const slugCell = postUrl ? `<a href="${esc(postUrl)}" rel="noreferrer">${esc(slug)}</a>` : esc(slug);
  return `<dl>
<div class="row"><dt>Title</dt><dd data-testid="unpublish-title">${esc(title)}</dd></div>
<div class="row"><dt>Slug</dt><dd data-testid="unpublish-slug">${slugCell}</dd></div>
</dl>`;
}

export function renderUnpublishPage(view: UnpublishView): string {
  if (view.kind === 'confirm') {
    return documentFor('Unpublish this article?', `<h1>Unpublish this article?</h1>
<p>It comes off the blog, its page and the sitemap right away. You can publish it again from the admin.</p>
${postRows(view.title, view.slug, view.postUrl)}
<form method="post" action="${esc(view.action)}">
<button type="submit">Unpublish</button>
</form>`);
  }
  if (view.kind === 'done') {
    return documentFor('Unpublished', `<h1 data-testid="unpublish-done">Unpublished</h1>
<p>The article is off the blog, its page and the sitemap.</p>
${postRows(view.title, view.slug)}
<p class="note">To publish it again, open it in the <a href="${esc(view.adminUrl)}">admin</a>.</p>`);
  }
  if (view.kind === 'error') {
    return documentFor('Something went wrong', `<h1 data-testid="unpublish-error">Something went wrong</h1>
<p>The site could not check this link just now. Try again in a minute, or unpublish the article from the <a href="${esc(view.adminUrl)}">admin</a>.</p>`);
  }
  return documentFor('This link no longer works', `<h1 data-testid="unpublish-gone">This link no longer works</h1>
<p>Unpublish links last 7 days and work once. This one has expired, was already used, belongs to an earlier publication of the article, or is incomplete. Nothing was changed.</p>
<p class="note">You can still unpublish any article from the <a href="${esc(view.adminUrl)}">admin</a>.</p>`);
}

/** Headers every answer of the page and its POST carries. */
export const UNPUBLISH_PAGE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};
