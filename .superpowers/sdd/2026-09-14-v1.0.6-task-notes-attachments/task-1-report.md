# Task 1 Report: Task note data and safe link rendering

## Status

Implemented and verified Task 1 in the `feature/v1.0.6` linked worktree.

## Implementation details

- Added deterministic attachment metadata normalization with the exact 10-file and 20 MiB limits.
- Rejected attachment metadata unless `addedAt` is finite and greater than zero. No timestamp is synthesized.
- Extended legacy task normalization with `updatedAt: null` and `attachments: []` defaults while preserving historical `createdAt` and `completedAt` values.
- Added immutable note edit application. Changed notes receive the supplied timestamp; unchanged notes retain their existing `updatedAt`.
- Added a UMD note utility that recognizes HTTP/HTTPS candidates, validates their protocol with `new URL`, trims trailing ASCII/Chinese punctuation, escapes text and attributes, and emits only text, `<br>`, and safe note-link `<button>` elements.
- Loaded `note-utils.js` before `app.js` in the renderer.

## Files changed

- `renderer/task-model.js`
- `renderer/note-utils.js`
- `renderer/index.html`
- `tests/task-note.test.js`
- `.superpowers/sdd/2026-09-14-v1.0.6-task-notes-attachments/task-1-report.md`

The pre-existing modification to `docs/superpowers/plans/2026-09-14-v1.0.6-task-notes-attachments.md` was not changed and is excluded from the Task 1 commit.

## RED evidence

Command:

```text
node --test tests/task-note.test.js
```

Initial output after adding the tests:

```text
exit_code=1
Error: Cannot find module '../renderer/note-utils'
tests 1
pass 0
fail 1
```

The top-level missing-module import prevented the individual contracts from running. The require was moved into each link test, without adding production code, and RED was rerun.

Final RED output:

```text
exit_code=1
fail 9
pass 0

normalizes legacy tasks: expected updatedAt null, received undefined
valid attachment metadata: expected attachment array, received undefined
malformed attachment metadata: normalizeAttachment is not a function
real note edit: applyTaskNoteEdit is not a function
unchanged note edit: applyTaskNoteEdit is not a function
input immutability: applyTaskNoteEdit is not a function
safe link rendering: Cannot find module '../renderer/note-utils'
HTTP/HTTPS and line breaks: Cannot find module '../renderer/note-utils'
invalid candidate escaping: Cannot find module '../renderer/note-utils'
```

This failure was expected and attributable only to the missing Task 1 behavior.

## Focused GREEN evidence

Command:

```text
node --test tests/task-note.test.js
```

Output:

```text
exit_code=0
pass 9
fail 0
skipped 0
cancelled 0
```

All migration, attachment validation, timestamp preservation, immutability, safe-link, escaping, punctuation, and line-break tests passed.

## Full unit suite

Command, run once after the focused GREEN run:

```text
npm test
```

Output:

```text
> smart-assistant@1.0.5 test
> node --test tests/*.test.js

tests 25
pass 25
fail 0
cancelled 0
skipped 0
todo 0
exit_code=0
```

## Self-review

- Reviewed the complete scoped diff, including both new files.
- Confirmed `normalizeAttachment` rejects missing, unsafe, oversized, non-finite, zero, and negative metadata, including the binding positive `addedAt` rule.
- Confirmed `normalizeTasks` preserves existing historical timestamps and normalizes attachment arrays without mutating source metadata.
- Confirmed `applyTaskNoteEdit` returns a new task and attachment array, detects semantic changes from normalized values, and preserves `createdAt`/`completedAt`.
- Confirmed URL candidates are escaped in visible text and `data-url`, unsafe/invalid candidates remain escaped text, and no anchor or arbitrary HTML nodes are emitted.
- Confirmed `note-utils.js` loads immediately before `app.js`.
- Ran `git diff --check` on the implementation and test files; exit code was 0 with no whitespace errors.
- Confirmed the implementation matches the brief and does not include unrelated refactoring.

## Concerns

- No implementation concerns found for Task 1.
- The worktree contains a pre-existing unstaged implementation-plan modification. It remains untouched and excluded from this task's commit.

## Fix Round 1: Reject path-like attachment display names

### Finding and implementation

`normalizeAttachment` previously accepted any nonblank display name, so absolute Windows, UNC, and POSIX source paths could survive normalization and be persisted with task metadata. Attachment display names now fail normalization when they contain a backslash, slash, or colon. Valid filename-only display names retain their original value.

### Files changed

- `renderer/task-model.js`
- `tests/task-note.test.js`
- `.superpowers/sdd/2026-09-14-v1.0.6-task-notes-attachments/task-1-report.md`

### RED evidence

Command:

```text
node --test tests/task-note.test.js
```

Output before the production fix:

```text
exit_code=1
✔ normalizes legacy tasks without changing historical timestamps (1.1253ms)
✔ valid attachment metadata survives task normalization (0.2733ms)
✔ rejects malformed attachment metadata (0.1741ms)
✖ rejects path-like attachment display names (1.5234ms)
✔ a real note edit records updatedAt and preserves createdAt and completedAt (0.1663ms)
✔ saving an unchanged draft does not update updatedAt (0.0933ms)
✔ applying a note edit does not mutate task or attachment inputs (0.2117ms)
✔ linkifies only safe web URLs and trims Chinese punctuation (1.338ms)
✔ renders HTTP and HTTPS note links with escaped attributes and line breaks (0.4086ms)
✔ leaves invalid URL candidates as escaped text (0.235ms)
ℹ tests 10
ℹ suites 0
ℹ pass 9
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 80.7782

AssertionError [ERR_ASSERTION]: C:\Users\name\secret.pdf
actual: normalized attachment metadata
expected: null
```

The failing regression uses literal cases for `C:\Users\name\secret.pdf`, `\\server\share\secret.pdf`, and `/home/name/secret.pdf`.

### Focused passing output

Command:

```text
node --test tests/task-note.test.js
```

Exact output:

```text
exit_code=0
✔ normalizes legacy tasks without changing historical timestamps (0.9752ms)
✔ valid attachment metadata survives task normalization (0.2535ms)
✔ rejects malformed attachment metadata (0.1736ms)
✔ rejects path-like attachment display names (0.7148ms)
✔ a real note edit records updatedAt and preserves createdAt and completedAt (0.2044ms)
✔ saving an unchanged draft does not update updatedAt (0.0994ms)
✔ applying a note edit does not mutate task or attachment inputs (0.2019ms)
✔ linkifies only safe web URLs and trims Chinese punctuation (1.0473ms)
✔ renders HTTP and HTTPS note links with escaped attributes and line breaks (0.2104ms)
✔ leaves invalid URL candidates as escaped text (0.1876ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 70.6723
```

### Full-suite passing output

Command:

```text
npm test
```

Exact output:

```text
exit_code=0

> smart-assistant@1.0.5 test
> node --test tests/*.test.js

✔ normalizes a DeepSeek-compatible provider (1.2393ms)
✔ does not duplicate chat completions path (0.3321ms)
✔ preserves custom provider values (0.233ms)
✔ reads OpenAI-compatible SSE delta content (0.3331ms)
✔ draft store round-trips a partially filled task form (1.2568ms)
✔ managed runtime path is inside appData and named 运行数据 (1.2671ms)
✔ 需关注包含置顶、高优先级、逾期及未来 24 小时内提醒任务 (1.8965ms)
✔ 需关注中的匹配子任务保留父任务上下文并隐藏无关兄弟任务 (0.6986ms)
✔ 筛选数量分别统计直接需关注、全部进行中和已完成任务 (0.1726ms)
✔ markTaskDone records completedAt and undo clears it (0.5302ms)
✔ pruneCompletedTasks removes only tasks completed more than 15 days ago (0.5935ms)
✔ buildTaskIndex groups and sorts children once (0.1896ms)
✔ normalizes legacy tasks without changing historical timestamps (1.0575ms)
✔ valid attachment metadata survives task normalization (0.3268ms)
✔ rejects malformed attachment metadata (0.2287ms)
✔ rejects path-like attachment display names (1.0843ms)
✔ a real note edit records updatedAt and preserves createdAt and completedAt (0.3052ms)
✔ saving an unchanged draft does not update updatedAt (0.1292ms)
✔ applying a note edit does not mutate task or attachment inputs (0.2772ms)
✔ linkifies only safe web URLs and trims Chinese punctuation (1.5364ms)
✔ renders HTTP and HTTPS note links with escaped attributes and line breaks (0.2629ms)
✔ leaves invalid URL candidates as escaped text (0.2213ms)
✔ brightness is constrained to the supported working range (0.7467ms)
✔ brightness resolves to a neutral color mix around 100 percent (0.6366ms)
✔ brightness survives a storage round trip (0.1976ms)
✔ task timestamps include a complete local date and minute (1.412ms)
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 140.5647
```

### Fix-round concerns

- No implementation concerns found.
- The pre-existing unstaged plan modification remains untouched and is excluded from this fix commit.
