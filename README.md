# More Women in Office

A static, data-driven forecast of how many women will serve in the U.S. House, Senate, and governors’ offices after the 2026 elections.

## Local development

Requires Node 22 or later and pnpm 11.

```sh
pnpm install
pnpm dev
```

Validation: `pnpm lint`, `pnpm test`, and `pnpm build`.

## Updating the data

The three files in `public/data/` are the application’s single source of truth. Replace `house.csv`, `governor.csv`, or `senate.csv` with an updated snapshot that preserves the schema. The UI validates required columns, numeric values, and a consistent `not_up_women_baseline`.

Important fields include race and candidate identifiers, `dem_woman` and `rep_woman` binary markers, party win probabilities, `expected_woman`, source URLs, `snapshot_date`, and the office-wide `not_up_women_baseline` repeated on each row.

The calculations are:

- Expected from 2026 races: `sum(expected_woman)`
- Expected post-election total: expected from 2026 races + the unique not-up baseline
- Party contribution: `sum(party_woman × party_win_probability)`

Unresolved candidates should have woman weight 0. The frontend never infers gender from a name.

### Automated Kalshi refresh

`python scripts/update_kalshi.py` refreshes D/R win probabilities and
`expected_woman` from Kalshi's public market-data API. Use `--dry-run` to fetch,
validate, and report coverage without changing the CSVs. Rows without two
confidently matched markets retain their existing values.

The `Update Kalshi data` GitHub Actions workflow runs every morning and can also
be started manually. It commits updated CSV snapshots to `main` and then starts
the normal deployment workflow.

## Deployment

Pushes to `main` run lint, tests, and a production build before deploying to GitHub Pages through `.github/workflows/deploy.yml`. Vite uses `/morewomeninthehouse/` as the Actions build base. `public/CNAME` configures the custom domain `morewomeninthehouse.com`.
