# Audit fixes and verification

The reviewed starting point is main commit `2728ba6b6f451e6612b0f4599e91627894ebe37c` (PR #2 merged). Its 40 tests pass, and an independent PostgreSQL check confirms B01 and B05. B02–B04 pass the browser regressions. B17 remained reproducible with two independently instantiated workers: a newer score of 90 was overwritten by 10. The other 17 findings were outside PR #2's scope.

This change addresses those remaining 18 findings and preserves the previous fixes. This is a bounded audit, not a claim that every possible defect in the repository has been discovered.

## Verification results

- 50 Playwright browser/unit tests pass, including the original assignment-switching tests.
- 12 integration groups pass against real PostgreSQL, the real Express app, and generated Prisma client. They include 30 invalid scans, six mixed-class write batches, valid-save controls, score persistence, timestamps, Bangkok dates, concurrent reminders, Excel cells, and the cross-worker spreadsheet race.
- Production build passes. Oxlint reports no warnings or errors. The build retains the existing large-JavaScript-chunk warning.
- The additive database migration applies successfully to the disposable test database.
- LINE and Google Sheets transports are deterministic local fixtures. No real students, messages, spreadsheets, or production databases are used in the tests. Provider acceptance and real camera hardware are not exercised.

| Finding | Result | Regression evidence |
| --- | --- | --- |
| B01 foreign student writes | Existing authorization preserved; lookup also scopes records to the student's classroom | `audit-api.mjs`, `batch-authorization.spec.js` |
| B02 stale exam roster | Existing identity guard preserved | `term-scores.spec.js` |
| B03 stale attendance roster | Existing identity guard preserved | `attendance.spec.js` |
| B04 stale camera selection | Existing live-context guard preserved | `scanner.spec.js` |
| B05 missing scan code | Invalid codes rejected without writes | `audit-api.mjs`, `validation.spec.js` |
| B06 clearing exam scores | Blank/null explicitly deletes the matching entry | API persistence + UI payload |
| B07 submitted totals | Only rows with a submission timestamp count | API list/roster comparison |
| B08 invalid scores | Reject nonnumeric, negative, over-maximum, and invalid maxima; zero score remains valid | 16 invalid-input cases + valid zero |
| B09 grades on missing work | Unchecking clears the grade; summaries/exports ignore missing submissions | API, keyboard UI |
| B10 wrong date | Shared Bangkok date used by attendance, scan, dashboard, missing-work logic | Fixed-clock API + browser |
| B11 due-today overdue | Due dates are overdue only after that school day ends | Fixed-clock API |
| B12 failed reminders marked sent | Pending delivery becomes sent only after provider acceptance | Failure/retry + same-key/payload checks |
| B13 concurrent reminders | PostgreSQL advisory lock prevents simultaneous sends; retry key is persisted before sending | Two concurrent real-DB runs send once |
| B14 missed reminder runs | Date ranges catch up overdue assignments | Missed-run fixture |
| B15 classroom navigation | Dashboard/schedule pass selected classroom to destination | Browser checks classroom 2 |
| B16 overwritten submission time | Atomic SQL preserves the original timestamp; manual edits record manual provenance | Save, QR rescan, database readback |
| B17 spreadsheet race/failure | PostgreSQL lock coordinates workers; one atomic batch replaces all four tabs | Real-DB cross-worker test + four SDK unit tests |
| B18 silent failures | Load/save/download errors are visible; dashboard, schedule, and missing work support retry | Failed load, retry, creation, download browser tests |
| B19 double extension | Existing `.xlsx` suffix is preserved | Download filename assertion |
| B20 empty prefix export | Export reads optional stored `Student.prefix` | Workbook cell readback |
| B21 keyboard controls | Navigation, logout, dashboard cards, and submission toggles use native buttons | Keyboard activation and score clearing |
| B22 mobile controls | Responsive sidebar and wrapping controls keep Save reachable at 375px | Layout bounds + successful click |
| B23 page language | HTML declares Thai | Browser attribute assertion |

## Running the checks

Install dependencies and the Playwright Chromium browser, then run `npm test`, `npm run build`, and `npm run lint`.

For the integration suite, explicitly set **TEST_DATABASE_URL** and **DATABASE_URL** to the same empty, disposable PostgreSQL database. Never use the production database. Apply migrations and run:

```sh
npx prisma migrate deploy --schema server/prisma/schema.prisma
npm run test:api
```

The suite refuses to start if teachers already exist. It creates synthetic fixtures, cleans only their IDs, and requires TEST_DATABASE_URL rather than silently using the application's database URL.

## Deployment and operational notes

Apply `20260905140000_audit_delivery_and_prefix` and regenerate Prisma before starting the updated backend. The migration adds an optional prefix and reminder delivery metadata; existing reminder logs retain `sent` status and existing student names are unchanged. Populate `Student.prefix` from school-provided records if the prefix column is needed; the application does not guess titles from names.

The local reminder scheduler now runs hourly. Configure an external production scheduler to call the existing authenticated cron endpoint hourly as well. Failed requests keep their immutable payload and retry key. Requests still unresolved after 23 hours move to `needs_review`; inspect the provider's acceptance before any manual resend. LINE's retry-key window is limited, and acceptance does not guarantee delivery to each recipient. See [LINE retry documentation](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).

Spreadsheet publication uses one `spreadsheets.batchUpdate` with `updateCells` ranges. Uncovered trailing cells are cleared as part of that replacement, not by a separate destructive request. Only values in the four mirror tabs' A:Z ranges are replaced; formatting is retained. See [Google batch updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate) and [UpdateCellsRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#UpdateCellsRequest). Locks coordinate workers sharing the same PostgreSQL database. A process crash or ambiguous provider timeout can still require a later reconciliation; these tests do not prove exactly-once external delivery under every infrastructure failure.

This patch prevents new occurrences; it cannot reconstruct previously overwritten grades or infer whether an old incorrectly recorded reminder was delivered. Review historical data separately. Audit risks R01–R07 (including the intentionally public lookup and seeded credentials) remain separate from the 23 confirmed findings.
