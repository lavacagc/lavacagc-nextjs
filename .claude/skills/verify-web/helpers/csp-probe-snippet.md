# Playwright `browser_evaluate` snippets

Copy-pasteable function bodies for common in-page probes. All work with the MCP `mcp__playwright__browser_evaluate` tool — paste into the `function` parameter.

## CSP eval probe

Confirms the page's CSP allows `'unsafe-eval'` (FB Pixel + GTM Custom HTML/JS depend on this).

```js
() => {
  try {
    return { ok: true, result: new Function('return 1+1')() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
```

Expected when CSP is correct: `{ ok: true, result: 2 }`. Failure mode: `{ ok: false, error: "EvalError: ..." }`.

## Form field discovery (label → input pairing)

Useful for /free-estimate, /contact, and other form pages. Confirms each named field has a `<label>` whose `for=` resolves to a real input.

```js
() => {
  const labels = ['Full Name', 'Email', 'Phone', 'ZIP Code'];
  return labels.map(label => {
    const labelEl = Array.from(document.querySelectorAll('label'))
      .find(l => new RegExp(label, 'i').test(l.textContent || ''));
    const inputId = labelEl?.getAttribute('for');
    const input = inputId ? document.getElementById(inputId) : null;
    return { label, hasLabel: !!labelEl, hasInput: !!input };
  });
}
```

## Dead-click affordance check

Confirms a card/element does NOT signal interactivity (no `hover:shadow-*`, no `cursor:pointer`, no `transition-all`). Used for the /about team-member fix.

```js
() => {
  const findCard = (regex, childSel) => {
    const h = Array.from(document.querySelectorAll('h2'))
      .find(e => regex.test(e.textContent || ''));
    const section = h?.closest('section');
    return Array.from(section?.querySelectorAll('[class*="rounded"]') || [])
      .find(el => el.querySelector(childSel));
  };
  const inspect = el => el ? {
    hasHoverShadow: /hover:shadow-elegant/.test(el.className),
    hasTransition: /transition-all/.test(el.className),
    cursor: getComputedStyle(el).cursor,
  } : null;
  return {
    teamCard: inspect(findCard(/meet our team/i, 'img, .object-cover')),
    valuesCard: inspect(findCard(/our values/i, 'h3')),
    mailtoLinks: document.querySelectorAll('a[href^="mailto:"]').length,
    telLinks: document.querySelectorAll('a[href^="tel:"]').length,
  };
}
```

Expected when fix is in place: `cursor: 'auto'`, both shadow + transition `false`, mailto/tel counts > 0 (real interactive elements preserved).

## Render-loop early warning

If you suspect React `#185` (Maximum update depth exceeded), this counts "Maximum update depth" errors in the console buffer. Pair with `mcp__playwright__browser_console_messages` afterwards for the actual messages.

```js
() => {
  const errors = (window.__capturedErrors || []);
  return {
    maxDepth: errors.filter(e => /Maximum update depth/.test(e)).length,
    total: errors.length,
  };
}
```

(For full console capture, use `mcp__playwright__browser_console_messages` with `level: "error"` — that's the canonical source. The snippet above is a one-shot peek.)

## CSP header probe (via curl, not Playwright)

```bash
UA="Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -sI -H "User-Agent: $UA" "$HOST/" \
  | grep -i "content-security-policy" \
  | tr ';' '\n' \
  | grep "script-src" \
  | grep -oE "unsafe-eval|<other-needle>"
```
