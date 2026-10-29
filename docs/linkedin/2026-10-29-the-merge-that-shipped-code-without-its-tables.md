# The merge that shipped code without its tables

Draft for Alex's review. Not published.

Yesterday an agent merged a pull request that had passed every gate we own: four independent reviews, a full browser suite on a local database, a static security sweep, a build, CI.
Production deployed in four minutes.
The new pages rendered.
And the one thing they existed to do, saving a customer's request, could not work, because the table it writes to did not exist.

Nobody had turned off the migration pipeline.
It had been failing quietly since February.

Here is the shape of the failure, because it is not specific to this project.

The hosting side (Vercel) deploys on merge.
The database side (Supabase) also applies migrations on merge, through its own integration, and reports the result as a check on the commit.
Both ran.
One succeeded.
The other hit a migration from eight months earlier that tried to create a policy that already existed, stopped, and marked the commit failed.
Nothing downstream looked at that check, because nothing downstream was configured to.
The site was live and green and missing its tables.

How did an old migration come to "already exist"?
Because at some point in the project's history, schema changes were applied by hand, or by a tool that did not record them in the migration history table.
From then on the database held the objects and the history did not, so every automatic apply failed at the first unrecorded file and never reached the new ones.
The people who had been shipping for months did not notice, because the next thirty migrations happened to be written defensively (IF NOT EXISTS everywhere) and their objects were put in place by other means.
The first migration that genuinely needed to run was the one that mattered.

Three things fixed it, and all three are the kind of thing an agent can do once a human has handed it the one key it lacks.

First, measure before touching.
With a read-only token the agent replayed every unrecorded migration against production inside a transaction it then rolled back.
"Already exists" meant applied.
A clean run meant idempotent or missing, which a second query on the tables resolved.
Fifty migrations, twelve minutes, zero changes to production.

Second, repair the history, do not rewrite the migrations.
The temptation is to make the old files idempotent so the pipeline gets past them.
That edits history to match a mistake.
Marking the forty-seven live migrations as applied and pushing the three missing ones took one command each.

Third, make the code survive the window.
Even with the pipeline fixed, a deploy can land seconds before its migration does.
The agent proved this on a preview: with the table absent, every service page returned a 500.
The read now falls back to the day-one seed and logs the failure.
A customer sees yesterday's price instead of an error page.

The lesson for anyone running agents against a real product: the gates you build are only as good as the signals they read.
Our pipeline read tests, lint, build and CI.
It did not read the database integration's check, and it did not probe the schema after deploy.
Both are one line each now.

If your migrations and your database disagree, you will find out at the worst moment, and the finder will probably be a customer.
Ask an agent to dry-run your migration history against production this week.
It costs nothing and it is the single cheapest audit I know.
