# 2026-10-26: stale forecasts blocked their own scheduled refresh

## Observed failure

- Scheduled prediction run [40328405050](https://github.com/wiepe/judge90-toto/actions/runs/40328405050) started at 13:11 UTC (22:11 JST).
- `npm test` failed (111 pass / 1 fail) before `npm run operate`. The assertion in `tests/dashboard.test.mjs` expected purchase candidates, but the purchase panel correctly refused stale data.
- Last successful prediction was generated at 04:55:03 UTC (13:55:03 JST). The page's six-hour freshness limit explains the warning in the user's screenshot. Acquisition was never attempted in the failed run; unused weather restrictions did not cause this failure.
- Weekly evaluation [40273885412](https://github.com/wiepe/judge90-toto/actions/runs/40273885412) succeeded. Its scheduled event actually started at 05:22 UTC (14:22 JST), later than the 09:47 JST cron target. GitHub schedule times are best effort.

## Cause and correction

The dashboard test read mutable production JSON and supplied a historical render time, while the purchase callback intentionally read the real current time. After six hours these clocks disagreed. Re-running the unchanged workflow cannot fix this deterministic failure, and the fallback invokes the same tests.

Use synthetic, fixed UI data and Node's scoped mock Date for the success test. Browser tests use the same synthetic data, with Playwright's controlled clock, including failure-state overrides. This also removes their dependence on an idle/error production status or changing round. The fixture is served only by the local test server; it is never written into public forecast files.

Additional regressions move the clock beyond six hours between render and click, for both purchase-screen buttons and forecast-screen budget shortcuts. Both must stop buying. Production freshness checks, model, retrieval/retry logic, schedules and saved forecasts remain unchanged.

## Validation and recovery

The original failure was reproduced locally before the fix. After the fix, all 114 Node tests and mobile checks (360/393/412/768 px, three screens, four budgets, five failure modes) pass; actionlint and diff checks pass. Live public freshness remains a separate operational check and is not replaced by synthetic UI tests.

Merge approval is required. After merge, the existing successful-main-CI initializer checks freshness and invokes the prediction workflow when overdue, then checks published Pages. Inspect `Unit and integration tests`, `Discover, reconcile, retry and update`, the delivery receipt, and initializer `Verify published Pages and data`. Confirm a new `updated_at`, matching dataset IDs, 13 games, and available purchase candidates while sales are open. No manual JSON timestamp edits or bypass of stale-data protection are acceptable. A merged fix is not itself evidence of successful publication.
