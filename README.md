# Gitrun

A single-page running journal for GitHub Pages. Tracks runs from **1 July 2026 through today**, including future years. The page has no backend, build step, or JavaScript dependencies.

Includes distance, moving time, device-reported calories, elevation, weighted pace, recent runs, heart rate, cadence, power and training effect when available, a weekly volume chart, an annual running calendar, this week's completed runs, searchable activity history, and monthly totals. Future race plans are not displayed.

## Preview

With Node.js 22 or newer:

```sh
npm run dev
```

Open **http://127.0.0.1:4173**. Until Garmin is connected, the page explicitly displays illustrative sample activities. A successful sync containing zero runs displays a real empty state, not sample data.

## Connect Garmin once, then update automatically

The included GitHub Action fetches running history and publishes the page **every six hours**, at approximately **03:23, 09:23, 15:23 and 21:23 WIB**. It also runs when you push to `main` or manually run it in Actions. Your watch must first upload the activity to Garmin Connect.

This uses the [unofficial python-garminconnect client](https://github.com/cyberjunky/python-garminconnect). Garmin's [official developer program is for business use](https://developer.garmin.com/gc-developer-program/program-faq/). Strava's [API agreement limits display of API data to the athlete who supplied it](https://www.strava.com/legal/api), so it is not used as the source for this public journal.

1. Create your GitHub repository and upload this project using `main` as its default branch. The site supports both `username.github.io` and `username.github.io/repository/` URLs.
2. In the repository, choose **Settings → Pages → Source → GitHub Actions**. The sync workflow needs permission to push to `main`; branch protection rules must allow its bot to do so.
3. Install the sync runtime locally. Python 3.12 or newer is required:

   ```sh
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   ```

4. With [GitHub CLI](https://cli.github.com/) signed in, run the setup helper. Replace `OWNER/REPOSITORY` with your existing repository:

   ```sh
   .venv/bin/python scripts/garmin_setup.py --repo OWNER/REPOSITORY
   ```

   Enter your Garmin email, password, and any verification code **in your terminal**. Password and verification prompts are hidden. They go to Garmin's authentication service and are never saved in the repository or printed. The helper imports your history and saves an encryption key as the repository's `GARMIN_SESSION_KEY` Actions secret via GitHub CLI.

   Without GitHub CLI, run the helper without `--repo`, then copy the contents of the ignored `.garmin-session/session.key` file into **Settings → Secrets and variables → Actions → New repository secret**, named `GARMIN_SESSION_KEY`. Do not paste this key into an issue, chat, source file, or Actions log.

5. Review the activity summaries in the preview. Commit and push **`.sync/garmin.enc`** and **`dist/data/activities.json`**. The encrypted session file belongs in the repository; the key does not. The workflow publishes only `dist/`, so the encrypted session is also excluded from the website.

Once set up, you can open the same GitHub Pages link on any device. There are no repeated exports. An open page checks for fresh website data every five minutes. A saved manual browser import takes precedence on that device; clear it in **My data** to use shared updates again.

### How the session stays connected

The setup helper encrypts Garmin's access and refresh tokens using authenticated Fernet encryption. The key lives in GitHub Actions secrets and an ignored local file. Every scheduled job decrypts the session in memory, lets the connector refresh it, and commits the encrypted replacement so the next job has the current refresh token. It never stores your Garmin password in GitHub.

Each job re-fetches the paginated history from July 2026, so edits and deletions on Garmin are reflected too. Only allowed running-summary fields are written to the website; account/profile IDs, device IDs, exact start timestamps, GPS coordinates, and routes are excluded. **Activity dates, titles, distance, duration, heart rate, calories, and other included effort measurements are public when this site/repository is public.** Review `dist/data/activities.json` before publishing.

If Garmin fails, the last deployed page stays online. Rotated session tokens are saved even when a later data request fails. The page shows the last successful update, and marks automatic sync overdue after 24 hours. GitHub marks failed workflow runs; enable its Actions notifications if desired.

Garmin can revoke a session or change its unofficial endpoints. If it requires authentication again, rerun the setup helper using the same repository and push the new encrypted session. If `main` changes during a sync, the workflow rebases before pushing; a conflict fails instead of overwriting work.

GitHub schedules can be delayed and can be disabled after 60 days without repository activity. Successful syncs commit refreshed data, which normally keeps this repository active. After a long pause or repeated failures, check **Actions → Sync Garmin and publish Gitrun** and re-enable/run it if needed. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Manual import fallback

In [Garmin Connect on the web](https://connect.garmin.com/modern/activities), load your activity history back to July 2026 and export the activity list as CSV. Use the **English-language** export and choose matching metric/imperial units in the import dialog. Garmin may export only the rows loaded in the activity list; verify that the earliest required date is included. [Garmin export help](https://support.garmin.com/en-IN/?=&faq=W1TvTPW8JZ6LfJSfK512Q8).

Use **My data → Import a file instead**, then **Download website data** to obtain `activities.json`. Browser imports replace the full dataset locally; they are not merged and do not update other devices. To publish one, replace `dist/data/activities.json` and push. If automatic Garmin sync is enabled, its next run replaces that published manual data.

Alternatively:

```sh
npm run import -- /absolute/path/to/Activities.csv metric
```

Use `imperial` for miles/feet. Gitrun JSON files can also be imported. Importing fails with a visible error if required dates, distances, or times are invalid; the previous dataset is preserved. Non-running activities are excluded and duplicate IDs are removed.

## Data definitions

- **Distance:** summed activity distance in kilometres.
- **Moving time:** Garmin moving duration, falling back to timer duration if the moving value is absent. It is not elapsed wall-clock time.
- **Average pace:** total moving seconds divided by total kilometres; not an average of per-run paces.
- **Heart rate:** duration-weighted where an average is shown. No heart-rate zones are invented without thresholds or time-in-zone data.
- **Calories:** device-reported activity calories, not an inferred estimate. Missing calorie/elevation measurements are shown as unknown, with coverage when totals are partial.
- **Consistency:** a day with at least one recorded run. Heatmap colours represent 0, under 5, 5–9.99, 10–14.99, and 15+ km. A weekly streak counts consecutive Monday–Sunday weeks with runs, allowing the current week to remain in progress.
- **Date windows:** 7/30 days include today, and never include dates before 1 July 2026. The sync's end date uses Asia/Jakarta; activity dates retain Garmin's local activity date. The browser's “today” follows its clock. Weekly volume and the latest run always cover the full journal; the period selector controls the totals, activity log, and monthly breakdown.
- **Other measurements:** shown only when supplied in the source. Summary endpoints/CSV do not contain every possible watch metric. There are no fabricated splits, routes, VO₂ max, recovery scores, calories, or training recommendations.

## Checks

```sh
npm run check
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Tests cover date boundaries into 2027, weighted calculations, missing measurements, CSV edge cases, unit conversions, deduplication, public-data allowlisting, spreadsheet formula escaping, session encryption, and refresh-token rotation. Live Garmin authentication and GitHub deployment require the owner's one-time setup.

## Files

```text
dist/                     The only directory served by GitHub Pages
  index.html              The single page
  style.css               Responsive dark / lime theme
  app.mjs                 Rendering and interactions
  data.mjs                Import, normalization, calculations
  demo.mjs                Clearly labelled illustrative fixtures
  data/activities.json    Public running summaries; empty until connected
scripts/garmin_setup.py    Interactive one-time connection
scripts/garmin_sync.py     Read-only Garmin sync + encrypted token refresh
.sync/garmin.enc           Created by setup; encrypted, safe to commit with key kept secret
.garmin-session/           Ignored local encryption key; never commit
.github/workflows/        Scheduled sync, checks, GitHub Pages deployment
```

The typography uses Google Fonts with local fallback fonts. No analytics or GPS map services are included.
