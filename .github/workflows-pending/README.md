# Pending workflow — needs a manual move

`publish.yml` in this directory is the finished publish-on-tag workflow for
midl#17. It could not be committed to `.github/workflows/` by the automated
triage agent: both the git push proxy and the GitHub MCP server's token used
by that agent lack the `workflow` OAuth/App scope required to create or
update files under `.github/workflows/` — GitHub enforces this regardless of
file content, for both `git push` and the Contents API.

**To finish wiring it up**, a maintainer (or any token with `workflow` scope)
runs, on this branch or on `main` after merge:

```sh
mkdir -p .github/workflows
git mv .github/workflows-pending/publish.yml .github/workflows/publish.yml
git rm -r .github/workflows-pending
git commit -m "chore: move publish workflow into .github/workflows"
git push
```

See the PR body for the full rationale and the open question on registry
choice (GitHub Packages vs public npm).
