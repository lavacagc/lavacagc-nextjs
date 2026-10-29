# Your migrations are lying to your agents

Draft for Alex's review. Not published. Written 2026-10-29 after the Home Services build.

---

I ran four coding agents in parallel on our website this week, each in its own git worktree, each testing against a local database replayed from the repo's migrations.
Within the first hour all four had stalled, one after another, on the same class of problem.

The local database was not the production database.
Not because of data.
Because of tables that production has and the migrations do not.

Here is what was missing when we replayed from scratch:

- `rate_limits`: every rate limiter in the codebase silently failed open. Four agents reported "the 429 path cannot be observed" before any of them could prove a limit existed.
- `google_reviews`: the homepage testimonials never rendered, and two existing tests failed for a reason that had nothing to do with the change under test.
- `leads`: the table that every lead form writes to had an id column and the scoring columns, and nothing else. The core pipeline of the business could not be exercised.
- `projects` and `project_images`: the portfolio tables did not exist at all.
- An enum type and a security function that a policy depended on, which stopped the replay halfway.

Every one of these had been created in the hosting provider's dashboard years ago and never captured as a migration.
Nobody noticed, because humans test against production, and against production everything is there.

Agents do not get to test against production.
They should not.
So they replay the migrations, and the replay is the only truth they have.
When the replay is a lie, the agent does one of three things, and all three are bad:

1. It reports that a feature cannot be verified and ships it unverified.
2. It "fixes" the environment by hand, in a way the next agent does not have.
3. It concludes the code is broken and rewrites something that was fine.

I saw all three in one afternoon.
The fourth agent nearly created the missing `rate_limits` table on the shared database on its own initiative.
It asked first.
That ask was the single most valuable message of the day, because the fix belonged in the baseline migration, not in one agent's worktree.

Three things I am changing:

**The replay is a gate.**
`supabase db reset` from an empty database, every migration, in CI.
If it does not reach the end, the PR is red.
Nothing an agent builds is testable until that is green.

**Dashboard-created objects get a guarded migration.**
`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, a `DO` block for types and functions.
On production they are no-ops.
On a replay they are the difference between a test and a shrug.

**"Not testable locally" is a finding, not a status.**
I now require every agent report to name what it could not exercise and why.
The list from this run became the launch checklist.
It is long.
It would have been invisible.

The uncomfortable part: the agents were right and the repo was wrong.
The code had a `preview baseline` migration whose whole purpose was to make replays work, and it was still missing five production objects.
Humans wrote that file.
Humans never ran it from scratch.

If you are putting agents on a codebase, run the migrations from nothing first.
What breaks is what your agents will be blind to.
