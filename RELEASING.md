# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets)
and published to npm via **OIDC trusted publishing** — no long-lived `NPM_TOKEN`
secret lives in this repo.

## Day-to-day flow

1. Make your change on a branch and open a PR.
2. Run `bun run changeset` and commit the generated file in `.changeset/`.
   Pick `patch` / `minor` / `major` and write a one-line summary — it becomes the
   changelog entry.
3. Merge the PR into `main`.
4. The **Release** workflow opens (or updates) a `chore: version packages` PR that
   bumps the version and updates `CHANGELOG.md`.
5. Merge that PR. The workflow runs again, this time **building and publishing to
   npm** with provenance.

That's it — `git tag`s, the GitHub-side version PR, the npm publish, and the
provenance attestation are all handled by CI.

## One-time setup (required before the first automated publish)

OIDC trusted publishing must be enabled for the package on npm, and npm requires a
package to exist before you can attach a trusted publisher to it.

1. **First publish, manually** (creates the package on the registry):

   ```bash
   npm login
   bun run build
   npm publish --access public
   ```

2. **Configure the trusted publisher** on
   <https://www.npmjs.com/package/kosovopay/access> → *Trusted Publisher*:
   - Publisher: **GitHub Actions**
   - Organization / user: `shkumbinhasani`
   - Repository: `kosovopay`
   - Workflow filename: `release.yml`
   - Environment: *(leave blank)*

3. From then on, every change ships a changeset and every merge to `main`
   publishes automatically — no token needed.

## Why no NPM_TOKEN?

The `release.yml` workflow grants `id-token: write`. npm ≥ 11.5.1 exchanges that
short-lived GitHub OIDC token for a one-time publish credential and attaches a
[provenance](https://docs.npmjs.com/generating-provenance-statements) statement, so
consumers can verify the package was built from this repo at this commit.
