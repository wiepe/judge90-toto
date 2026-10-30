# Purchase UI delivery

The purchase screen displays home/away names by official match number. Individual-ticket details start open so teams are visible without expanding a summary.

When changing `assets/purchase.mjs`, `assets/dashboard.mjs` or `assets/dashboard.css`, run:

```
node scripts/version_purchase_ui.mjs
node scripts/version_purchase_ui.mjs --check
```

Commit the rewritten `index.html` and `assets/dashboard.mjs` too. The purchase import uses its content hash; the entry-point URL then uses the entry's content hash; the stylesheet URL uses the CSS hash. Main CI rejects a stale hash. This intentionally covers the purchase display dependency chain, not every asset in the application.

A screenshot with three-column No.-only cells and the old summary text indicates the previous UI is still running. Server file verification alone does not prove an already-open browser tab refreshed. A newly opened `?screen=teams#purchase` URL loads the new HTML after deployment; versioned asset URLs bypass older cached copies. An already-running old tab cannot execute this new fix until it navigates or reloads. Do not recommend deleting site storage: the encrypted personal ledger is device-local.

The browser regression primes the old unversioned dashboard/purchase/CSS URLs with a one-day HTTP cache, confirms the old No.-only view, then navigates to the new document in the same browser context without clearing cache or storage. It verifies 13 team names, the one-column layout, initially open individual details and preservation of a local-storage sentinel. Standard tests still cover stale-data stopping, four budgets, mobile widths and encrypted records.
