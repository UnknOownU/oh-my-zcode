---
name: git-master
description: MUST USE for ANY git operation — commits, rebases, history questions. Detects the repo's own commit style and enforces atomic, staged-by-name, secret-free commits; rewrites only local history with a named way back; answers history questions with cited evidence (hash, subject, file, line). Triggers on commit, rebase, squash, "who wrote", "when was X added", "find the commit that", or touching .gitignore / conflict markers.
when_to_use: before any git command that writes, and for any question about repository history
---

# git-master: the doctrine

> **Read the repository before you infer anything. The repo's own history is the style guide; a failed lookup is not a proof; nothing destructive moves without the user's explicit ask and a known way back.**

## Mode gate

Decide the mode first, then act inside it — never across:
- **COMMIT** — stage and commit local changes.
- **REBASE** — rebase, squash, fixup, reorder, split: any history rewrite.
- **HISTORY** — answer when / where / who / which commit changed something.
- **STATUS** — inspect branch, diff or worktree; changes nothing.

A request that is only investigative reports findings and stops.

## Ground truth, before any inference

Gather the facts in parallel before reasoning: `git status`, `git diff` and `git diff --cached`, the current branch and its upstream, `git log -15` (style + recency). A missing upstream or absent `main` is normal — fall back to the best available fact and say so. **Never treat a failed lookup as proof.**

## COMMIT mode

1. **Detect the style, then match it.** Read the last ~15 subjects: `type(scope):`? emoji? plain imperative? The repository's existing convention wins — your taste does not. No detectable convention → Conventional Commits: `type(scope): imperative subject`, subject ≤ 72 chars, body explains **why**, not what.
2. **Atomic units.** One commit = one logical change that leaves the tree working, revertable alone, cherry-pickable alone. The test: if the message needs "and", split the commit.
3. **Stage by name.** `git add <path>` for each intended file — never `git add .` blind. Verify with `git status` that the staged set matches the stated intent exactly; unrelated dirty work stays dirty.
4. **The staged diff is the commit.** Re-read `git diff --cached` before writing the message. Secrets, `.env`, keys and tokens, large binaries, debug leftovers, files unrelated to the intent — each is a **block**, not a style note; warn the user on anything sensitive.
5. **Message discipline.** Subject in the imperative, describing the change, never the session ("add X", not "I added X"). The body carries the why and the consequences.
6. **Never push, amend or rewrite without the user's explicit ask.** A local commit is reversible; everything past that needs the word.

## REBASE mode

- Rewrite **local-only** history. Commits already on a shared branch are not touched without an explicit ask.
- Before starting, name the recovery path out loud: a backup branch, or the reflog hash you fall back to.
- `git rebase --abort` is always a valid answer. Mid-rebase, conflicts are resolved per-commit — never "later".
- Push a rewritten branch with `--force-with-lease`, never bare `--force`, and only after the user confirmed.
- Stacked branches follow the rewrite with `git rebase --update-refs`.

## HISTORY mode

Pick the tool by the question, then **cite the evidence** — commit hash, subject, file, line:
- "when was X added" / "find deleted code" → `git log -S"X"` (add `--all` for deleted code)
- "commits touching a pattern" → `git log -G"regex"`
- "who wrote this line" → `git blame -L <start>,<end> -- <file>`
- "history of one file across renames" → `git log --follow -- <file>`
- "which commit introduced the bug" → `git bisect start` / `good` / `bad`; `git bisect run <cmd>` when a deterministic test exists — and **`git bisect reset` is not optional**
- "where did my commits go" → `git reflog`

If the evidence is ambiguous, say what remains unproven — an inferred commit is an allegation; a shown one is a fact.

## Modern commands

Prefer `git switch` and `git restore` (Git 2.23+) over legacy `checkout` double-duty; `git restore --staged <path>` to unstage. Reflexes from old training data are not a reason to keep them.

## Safety checks — before any write

- Current branch known; dirty work accounted for (staged, stashed or committed — never silently overwritten).
- Upstream / pushed state known — or explicitly declared unknown.
- The operation matches what the user asked, nothing more.
- The way back is known and named.
