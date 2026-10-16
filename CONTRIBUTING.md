# Contributing to Clean Listings for Avito

Thank you for helping improve Clean Listings. Keep changes focused, preserve explicit user choices,
and add regression coverage for bugs in filtering, storage, navigation, or rendering.

## Start with an Issue

Search the [issue tracker](https://github.com/Archangel-gabri/clean-listings/issues) first. Open an
issue for a bug or proposal so its page, permission, and navigation impact can be agreed.

## Local Setup

The extension has no runtime dependencies or build step. Playwright is used only for tests.

```bash
git clone https://github.com/Archangel-gabri/clean-listings.git
cd clean-listings
npm ci
npx playwright install chromium
npm run check
```

For a manual check, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select the repository folder. Use test browsing data and remove the temporary install after
the check.

## Tests and Linting

Run the complete gate:

```bash
npm run check
```

This performs syntax checks and runs the retry, manifest, isolated unpacked-extension, and DOM
regression suites. No separate formatter or linter is configured. Passing fixtures does not prove
compatibility with the current live site or reproduce historical performance measurements.

## Code Style

- Use the existing vanilla JavaScript style and keep parsing, storage, and rendering separated.
- Preserve Manifest V3 permissions and the extension's no-network-call boundary.
- Preserve user-owned URL state; do not overwrite a native filter choice the extension did not set.
- Add a sanitized regression fixture for DOM, storage, navigation, or layout bugs.
- Avoid unrelated formatting, generated archives, or dependency changes.

## Propose a Change

1. Agree the scope in an issue.
2. Create a branch such as `fix/filter-retry` from `master`.
3. Make the smallest complete change and update tests and documentation.
4. Run `npm run check` and review the complete diff.
5. Open a pull request with the issue link, test output, and sanitized screenshots if useful.

## Data and Secrets

Do not submit cookies, sessions, account details, browsing history, saved listing data, API keys,
tokens, credentials, personal data, database dumps, or raw page captures with seller information.

## Security Vulnerabilities

Do not open a public issue for a suspected vulnerability. Use GitHub Security's
[Report a vulnerability](https://github.com/Archangel-gabri/clean-listings/security/advisories/new)
form and include safe reproduction steps without secrets or personal data.
