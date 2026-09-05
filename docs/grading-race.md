# Assignment switching could overwrite another assignment's grades

The assignment selector and roster were independent state. Selecting assignment B
immediately changed the save URL to B, but A's roster remained displayed and
saveable until B's request finished. An old response could also overwrite B's
roster after B had loaded. Both assignments can belong to the same classroom and
contain the same students, so classroom membership validation cannot detect the
wrong scores.

## Reproduction on baseline 6c747af

1. Create two assignments A and B in one classroom with the same student. Save
   A's score as 10 and B's score as 90, with both submissions marked submitted.
2. Open the grading screen and load A.
3. Delay the GET for B's submissions, then select B and press Save.
4. The browser sends A's score 10 to B's submissions endpoint. Reloading B shows
   10: the previous grade has been overwritten.

The other timing variant starts A's request, selects B, lets B finish, then
releases A. The old response replaces B's roster without changing the selector.

## Fix

- Associate each loaded roster with its assignment ID. Display/edit/save it only
  when it matches the selected assignment.
- Ignore results from obsolete roster and assignment-list requests.
- Remount assignment grading on classroom changes so previous assignments,
  rosters, and pending callbacks cannot affect the new classroom.
- Keep failed loads unsaveable and display an error. Preserve current edits when
  refreshing submission counts after a successful save.

## Verification

All four Playwright regressions failed on the original frontend, then passed
with the fix. The tests control response completion explicitly instead of relying
on a slow connection or arbitrary sleep durations. `npm test` runs them against
the real React UI with an independent in-memory API store.

The pending-load scenario was also executed against the actual Express routes,
generated Prisma client, and a disposable PostgreSQL 18.4 database using the
repository migration. Only B's GET response was delayed in the browser; writes
went to the real backend/database. No Google Sheets or LINE credentials were
configured.

| Check | Original frontend | Fixed frontend |
| --- | --- | --- |
| Save while B's roster is pending | Enabled | Disabled |
| B's persisted score while pending | 10 (overwritten) | 90 (preserved) |
| Deliberately edit loaded B to 91 | — | Saved and reloaded as 91 |
| A after editing B | — | Remains 10 |

The PostgreSQL check used the exact original `Grades.jsx` from commit `6c747af`
for the failing run, with the same unchanged backend in both runs. The permanent
browser tests require no database and cover all four timing/failure scenarios.
