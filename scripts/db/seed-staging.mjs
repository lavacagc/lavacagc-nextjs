#!/usr/bin/env node
// Copy PUBLIC CONTENT from production into the staging project, so previews and
// the e2e suite render real pages. Customer data is never copied: the allowlist
// below holds only tables whose rows are already public on the site (or are
// site configuration), and anything not on it stays behind.
//
//   SUPABASE_ACCESS_TOKEN=... node scripts/db/seed-staging.mjs
//
// Reads production through the Management API's read-only query mode; writes
// staging with ON CONFLICT DO NOTHING, so a rerun only adds what is missing.
// Refuses to write to the production project.

const PROD = 'xrvbrnrbnyfdwkfdoepq';
const STAGING = process.env.STAGING_PROJECT_REF ?? 'wrffvnmtmtgfrcqvcbia';

// Order matters only for readability; FKs are deferred by inserting in one
// transaction with triggers in replica mode.
export const CONTENT_TABLES = [
  'service_areas', 'services', 'site_settings', 'cms_pages', 'non_negotiables',
  'blog_posts', 'maintained_articles', 'content_facts', 'seo_metadata',
  'projects', 'project_images', 'google_reviews', 'compliance_documents',
  'home_services', 'maintenance_catalog', 'home_care_products', 'home_care_product_tasks',
  'feature_releases', 'smart_banners', 'cta_variants', 'experiments', 'experiment_backlog',
  'calculator_project_types', 'calculator_option_categories', 'calculator_option_items',
];

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is required');
  process.exit(2);
}
if (STAGING === PROD) {
  console.error('refusing: the target is the production project');
  process.exit(2);
}

async function query(ref, sql, readOnly) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  const body = await res.json();
  if (!res.ok || !Array.isArray(body)) throw new Error(`${ref}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const lit = (s) => `'${s.replace(/'/g, "''")}'`;

const statements = ['SET LOCAL session_replication_role = replica;'];
const summary = [];
for (const table of CONTENT_TABLES) {
  // Insertable columns in staging (generated and identity-always columns excluded).
  const cols = (await query(STAGING,
    `select column_name from information_schema.columns where table_schema='public' and table_name=${lit(table)} and is_generated='NEVER' and coalesce(identity_generation,'')<>'ALWAYS' order by ordinal_position`, true))
    .map((r) => r.column_name);
  if (cols.length === 0) { summary.push(`${table}: missing in staging, skipped`); continue; }
  const rows = await query(PROD, `select coalesce(json_agg(t), '[]'::json) as j from public.${table} t`, true);
  const json = JSON.stringify(rows[0].j);
  const list = cols.map((c) => `"${c}"`).join(', ');
  statements.push(
    `INSERT INTO public.${table} (${list}) SELECT ${list} FROM json_populate_recordset(null::public.${table}, $seed$${json}$seed$) ON CONFLICT DO NOTHING;`,
  );
  summary.push(`${table}: ${rows[0].j.length}`);
}

await query(STAGING, `BEGIN;\n${statements.join('\n')}\nCOMMIT;`, false);
console.log(`seeded staging ${STAGING} from production content:\n  ` + summary.join('\n  '));
