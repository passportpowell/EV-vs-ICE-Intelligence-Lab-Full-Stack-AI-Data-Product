# EV vs ICE Intelligence Lab

[![CI](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/ci.yml/badge.svg)](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/ci.yml)
[![E2E](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/e2e.yml/badge.svg)](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/e2e.yml)
[![CodeQL](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/codeql.yml/badge.svg)](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/codeql.yml)
[![Refresh data](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/passportpowell/EV-vs-ICE-Intelligence-Lab-Full-Stack-AI-Data-Product/actions/workflows/refresh-data.yml)

Interactive portfolio project comparing electric vehicles with petrol and diesel ICE vehicles across ownership cost, energy use, lifecycle emissions, driving style, and scenario assumptions.

The repo is designed to show full-stack data product work rather than a static dashboard: Python processing builds the dataset, SQLite stores the analytical artifact, REST API routes expose comparisons, and the React UI makes the assumptions adjustable.

## Status and interpretation

This is a **portfolio prototype**, not a validated vehicle purchasing or fleet procurement service. Results depend on the selected vehicle data, source dates and user assumptions. Generated artifacts and a successful HTTP response do not establish that every upstream input is current.

Fuel prices are discovered from DESNZ's open-ended current CSV series or dated weekly releases, excluding the 2003–2017 archive. The parser chooses the greatest valid, non-future source date. A weekly observation older than **14 days** is marked stale; this is an application policy, not an official publication guarantee. Fetch/check time is separate from observation date. Failed discovery, requests or invalid rows return an explicitly stale checked fallback. The dashboard displays the observation date, status, check time and source link, and allows manual price overrides.

Dependency checks block moderate-or-higher findings across runtime and development packages. The only temporary exception is the development-only braces advisory, owned and expiring as documented in [dependency audit policy](docs/SECURITY.md). A passing gate with that exception does not mean an unfiltered audit is clean.

## Engineering evidence

- **Python data context:** Pandas, NumPy, SciPy, and scikit-learn pipeline in `pipeline/ev_ice_pipeline`.
- **Scientific stack:** cost/emissions modelling, signal processing over drive cycles, generated feature tables.
- **AI / ML:** random forest cost-per-mile model with metrics and feature importance surfaced in the app.
- **Agentic AI:** transparent advisor that classifies intent, retrieves context, runs calculations, and explains its recommendation.
- **RAG:** local retrieval over a generated vehicle/scenario/model knowledge corpus, exposed in UI and API.
- **Trim-aware data modelling:** vehicle catalog tracks make, model, model year, trim, body style, and UK market status.
- **Data provenance:** overlapping DVLA/catalog values are compared field by field, with conflicts shown side by side by source.
- **Source-dated UK energy pricing:** EV tariff comparison includes off-peak rates, peak rates, standing charges, source dates, GOV.UK petrol/diesel refresh, and custom user overrides.
- **Equivalent vehicle comparison:** selecting a trim populates comparable same-segment EV, petrol, diesel, and hybrid options with manual override slots.
- **Trim matching:** DVLA imports are ranked against local trims with confidence scores and match reasons.
- **SQL:** reproducible SQLite artifact at `data/processed/ev_ice_comparison.sqlite`.
- **JavaScript / React / HTML / CSS:** Next.js app router dashboard with custom responsive CSS.
- **REST APIs:** `/api/vehicles`, `/api/scenarios`, `/api/comparisons`, `/api/catalog`, `/api/import/dvla`, `/api/rag`, and `/api/agent`.
- **Automation / CI/CD:** GitHub Actions workflow runs data build, Python tests, TypeScript tests, linting, and Next build.
- **SEO:** metadata, robots, sitemap, Open Graph metadata, and structured JSON-LD.
- **Vercel-ready:** `vercel.json` and standard Next.js build flow.
- **Reliability mechanisms demonstrated:** health endpoint, security headers, dependency audit, error boundary, and typed API responses.

## Local Setup

```bash
npm install
pip install -r requirements.txt
npm run data:build
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run data:test
npm run lint
npm run test
npm run build
```

or run the full check:

```bash
npm run check
```

## Data Pipeline

Raw demo inputs live in `data/raw`:

- `vehicles.csv`: EV, petrol, diesel, and petrol hybrid examples.
- `energy_prices.csv`: energy price scenarios.
- `ev_tariffs.csv`: UK EV tariff references with off-peak/peak rates, standing charge scope, source dates, and conflict notes.
- `grid_intensity.csv`: grid carbon intensity assumptions.
- `scenario_profiles.csv`: ownership and usage scenarios.
- `driving_cycles.csv`: speed traces for signal-processing features.

The build step creates:

- `src/data/portfolio-dataset.json` for the Next.js UI.
- `public/data/portfolio-dataset.json` for direct download or inspection.
- `data/processed/portfolio-dataset.json` as a pipeline artifact.
- `data/processed/ev_ice_comparison.sqlite` as the SQL artifact.
- `rag_corpus` records inside the JSON and SQLite outputs.
- `source_registry` and `vehicle_source_values` tables inside SQLite for provenance-aware data engineering.
- `ev_tariffs` records inside JSON and SQLite for tariff-aware running-cost comparison.

The seed data is transparent and replaceable. It is suitable for engineering demonstration, not purchase advice.

## API Examples

```http
GET /api/vehicles
GET /api/scenarios
GET /api/catalog
GET /api/catalog?year=2021&make=Volkswagen&q=golf
GET /api/health
GET /api/comparisons?scenario=mixed_household&annualMiles=12000&ownershipYears=5
GET /api/comparisons?scenario=high_mileage_fleet&segment=hatchback
GET /api/tariffs
GET /api/prices/fuel
GET /api/energy-comparison?tariffId=intelligent-octopus-go&annualMiles=12000
GET /api/import/dvla?registration=AB12CDE
GET /api/rag?q=Which vehicle is best for high mileage emissions?
GET /api/agent?q=I drive 22000 miles a year and want low running costs
```

The comparison endpoint accepts query overrides such as `petrolGbpPerLitre`, `dieselGbpPerLitre`, `homeElectricityGbpPerKwh`, `homeChargingSharePct`, `urbanSharePct`, and `gridGco2ePerKwh`.

The tariff layer is UK-only. `ev_tariffs.csv` seeds current EV tariff references from MoneySavingExpert's EV tariff table, with local transcript notes retained where they agree or conflict. Standing charges are region-specific, so the app shows the source/scope and lets the user enter their own p/day value. `/api/prices/fuel` refreshes average UK petrol and diesel prices from the GOV.UK/DESNZ weekly road fuel CSV and falls back to the latest checked values if the live request fails.

The dashboard includes short explanations below analytical panels and charts so each visual says what it shows and why it matters. The ranked comparison table is the active scenario/filter list sorted by total cost per mile, including depreciation, energy/fuel, maintenance, ownership period, and active tariff/fuel inputs.

The local catalog is trim-aware and UK-focused for 2016-2026 model years. The DVLA import route can enrich a registration lookup when `DVLA_API_KEY` is configured, but official DVLA vehicle enquiry data does not provide consumer trim packs, so trim matching still needs the local catalog or a commercial specification API. The seed catalog includes multiple 2024 Tesla Model Y trims, including RWD, Long Range RWD, Long Range AWD, and Performance AWD, so the catalog no longer implies only one UK Model Y variant existed.

The catalog UI and `/api/catalog` use availability windows rather than a single representative model year. For example, filtering by `year=2021` returns trims available in 2021 even when their representative row uses a different model year.

`Showing X of Y` in the catalog means `X` trims match the active search/make/model/year/powertrain filters. It is not a claim that only `X` vehicles exist in the dataset or the UK market.

When live DVLA import is used with a selected catalog trim, the API returns a `provenance` report. Matching fields are marked as `match`, conflicting overlapping fields are marked as `conflict`, and one-source-only fields are marked as `dvla-only`, `catalog-only`, or `not-comparable`. The UI keeps both values visible with their source labels instead of silently overwriting one value with another.

The same import response also returns likely local trim matches with confidence scores. Matching uses make, fuel type, model year, availability window, CO2 closeness, and optional model/trim hints.

## Production Readiness

Current hardening includes:

- Security headers configured in `next.config.ts`.
- `/api/health` for deployment smoke checks.
- `/api/prices/fuel` with live refresh and fallback metadata for petrol/diesel prices.
- Error boundary for dashboard render failures.
- Request validation, timeout handling, and non-JSON fallback for DVLA import.
- Dependency audit through `npm run security:audit`.
- CI coverage for Python data tests, TypeScript tests, lint, audit, and production build.

The bundled CSV catalog is intentionally a seed dataset. A true production rollout should connect scheduled ingestion from official/commercial sources and store source values in a hosted database.

## Agentic AI And RAG

The RAG corpus is generated by the Python pipeline from vehicles, scenarios, assumptions, ML model metrics, powertrain summaries, and signal-processing outputs. The local retriever scores matching documents and returns citations.

The agent layer uses that retrieved context, classifies the user's intent, chooses a scenario, runs deterministic calculations, and returns a recommendation with reasoning steps. It is intentionally local and explainable so the project runs without paid LLM calls, while still showing the architecture needed for a production LLM or vector-database extension.

The ML model panel shows global training diagnostics. R2, MAE, and feature importance are model-level measures and are not retrained when a user selects a vehicle; the selected-vehicle cost signal below them updates from the active scenario.

## Deploy

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Use the default Next.js settings.
4. Keep generated data committed, or add `npm run data:build && npm run build` as the Vercel build command if Python dependencies are available in the deployment environment.

Suggested repo name: `ev-ice-intelligence-lab`.
