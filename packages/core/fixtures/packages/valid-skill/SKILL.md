---
name: commit-message-writer
description: Generates conventional commit messages from staged git diffs. Activates when the user requests a commit message and produces type(scope) subject format.
---

# Commit Message Writer

Generate a commit message for the currently staged changes.

## Instructions

1. Read the staged diff using `git diff --staged`
2. Analyze the changes to determine the type, scope, and subject
3. Output the commit message in conventional commit format

## Examples

Input: A diff showing a new function added to `auth.ts`
Output: `feat(auth): add token refresh endpoint`
