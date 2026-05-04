# EV vs ICE Intelligence Lab

Interactive portfolio project comparing electric vehicles with petrol and diesel ICE vehicles across ownership cost, energy use, lifecycle emissions, driving style, and scenario assumptions.

The repo is designed to show full-stack data product work rather than a static dashboard: Python processing builds the dataset, SQLite stores the analytical artifact, REST API routes expose comparisons, and the React UI makes the assumptions adjustable.

## Portfolio Signals

- **Python data context:** Pandas, NumPy, SciPy, and scikit-learn pipeline in `pipeline/ev_ice_pipeline`.
- **Scientific stack:** cost/emissions modelling, signal processing over drive cycles, generated feature tables.
- **AI / ML:** random forest cost-per-mile model with metrics and feature importance surfaced in the app.
- **Agentic AI:** transparent advisor that classifies intent, retrieves context, runs calculations, and explains its recommendation.
- **RAG:** local retrieval over a generated vehicle/scenario/model knowledge corpus, exposed in UI and API.
- **Trim-aware data modelling:** vehicle catalog tracks make, model, model year, trim, body style, and UK market status.
- **Data provenance:** overlapping DVLA/catalog values are compared field by field, with conflicts shown side by side by source.
- **Current UK energy pricing:** EV tariff comparison includes off-peak rates, peak rates, standing charges, source dates, GOV.UK petrol/diesel refresh, and custom user overrides.
- **Trim matching:** DVLA imports are ranked against local trims with confidence scores and match reasons.
- **SQL:** reproducible SQLite artifact at `data/processed/ev_ice_comparison.sqlite`.
- **JavaScript / React / HTML / CSS:** Next.js app router dashboard with custom responsive CSS.
- **REST APIs:** `/api/vehicles`, `/api/scenarios`, `/api/comparisons`, `/api/catalog`, `/api/import/dvla`, `/api/rag`, and `/api/agent`.
- **Automation / CI/CD:** GitHub Actions workflow runs data build, Python tests, TypeScript tests, linting, and Next build.
- **SEO:** metadata, robots, sitemap, Open Graph metadata, and structured JSON-LD.
- **Vercel-ready:** `vercel.json` and standard Next.js build flow.
- **Production hardening:** health endpoint, security headers, dependency audit, error boundary, and typed API responses.

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

The local catalog is trim-aware and UK-focused for 2016-2026 model years. The DVLA import route can enrich a registration lookup when `DVLA_API_KEY` is configured, but official DVLA vehicle enquiry data does not provide consumer trim packs, so trim matching still needs the local catalog or a commercial specification API.

The catalog UI and `/api/catalog` use availability windows rather than a single representative model year. For example, filtering by `year=2021` returns trims available in 2021 even when their representative row uses a different model year.

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

## Deploy

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Use the default Next.js settings.
4. Keep generated data committed, or add `npm run data:build && npm run build` as the Vercel build command if Python dependencies are available in the deployment environment.

Suggested repo name: `ev-ice-intelligence-lab`.
