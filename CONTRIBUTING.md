# Contributing

## Branches

`main` is the only long-lived branch, and it is protected: changes reach it only through
pull requests whose checks pass. Work on a short-lived branch named after the change, for
example `feat/snapshot-form` or `fix/interpolation-rounding`, and open a pull request into
`main`.

## Pull requests

The pull request **title** must follow [Conventional Commits](https://www.conventionalcommits.org/),
because it becomes the commit on `main` and decides the next version:

| Title | Example | Release |
|---|---|---|
| `feat: …` | `feat: add snapshot form` | Minor (1.**2**.0) |
| `fix: …`, `perf: …`, `revert: …` | `fix: round interpolated values` | Patch (1.1.**1**) |
| `docs: …`, `refactor: …`, `style: …`, `test: …`, `build: …`, `ci: …`, `chore: …` | `docs: describe release process` | Patch (1.1.**1**) |
| `feat!: …` or a `BREAKING CHANGE:` footer | `feat!: replace YAML records with the database` | Major (**2**.0.0) |

Commit messages inside the branch are free-form: only the title matters.

Before merging, these checks must pass:

| Check | Workflow |
|---|---|
| Backend (lint, format, types, tests) | `ci.yml` |
| Frontend (lint, format, types, tests, build) | `ci.yml` |
| Container images | `ci.yml` |
| Scan for secrets and personal data | `gitleaks.yml` |
| Conventional Commit title | `pr-title.yml` |

Run the same checks locally first (see the README's **Checks** section).

Pull requests are **squash-merged**, so each one becomes a single commit on `main` titled
after the pull request; the branch is deleted afterwards.

## Releases

Every merge into `main` produces a release automatically (`release.yml`):

1. [semantic-release](https://semantic-release.gitbook.io/) reads the new commit, computes
   the next version, tags it `vX.Y.Z`, and publishes a GitHub Release with notes grouped by
   type.
2. The API image is built with that version and pushed to GitHub Container Registry as
   `ghcr.io/marcparaira/net-worth-dashboard/api:X.Y.Z` and `:latest`.
3. The frontend is built with that version and attached to the release as
   `net-worth-dashboard-frontend-X.Y.Z.tar.gz`.

The running version appears in the web app's footer and in `GET /api/health`. Local builds
show `dev`.

If publishing the image or the frontend fails after the release was created, fix the cause
and re-run the **Release** workflow from the Actions tab: it reuses the existing tag and
republishes the artifacts.
