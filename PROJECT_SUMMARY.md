# EV vs ICE Intelligence Lab - Portfolio Summary

## What This Project Is

EV vs ICE Intelligence Lab is an interactive data product for comparing electric vehicles against petrol, diesel, and petrol hybrid vehicles. It lets a user change ownership assumptions, mileage, charging mix, electricity prices, fuel prices, and usage scenarios, then compares vehicles by total cost of ownership, energy cost, lifecycle CO2e, and break-even mileage.

It now includes a UK tariff and fuel-pricing layer: EV off-peak/peak electricity tariffs, standing charges, GOV.UK petrol/diesel refresh, and custom user-entered rates all feed the running-cost comparison.

The project is intentionally built as a portfolio piece for data, AI, automation, and full-stack engineering roles. It is not just a React page. It includes a reproducible Python data pipeline, generated SQL and JSON artifacts, REST API routes, automated tests, CI/CD configuration, SEO metadata, and a Vercel-ready deployment setup.

## What A Recruiter Or Hiring Manager Should Notice

This repo demonstrates:

- Python in a data context.
- Python scientific stack: Pandas, NumPy, SciPy, and scikit-learn.
- Data processing from raw CSV files into production-facing artifacts.
- SQL database generation using SQLite.
- React, TypeScript, HTML, CSS, and Next.js app router.
- REST API design with server-side API routes.
- Trim-aware vehicle data modelling across make, model, model year, trim, body style, and UK market status.
- Source provenance handling for conflicting values between DVLA import data and the local trim catalog.
- Source provenance for tariff values, including supplier/table notes, transcript-derived notes, and region-specific standing-charge caveats.
- Live-current price automation through a GOV.UK/DESNZ weekly road fuel CSV endpoint with fallback metadata.
- Confidence-scored trim matching for imported registration-level data.
- Production hardening including health checks, security headers, dependency audit, request timeouts, and an error boundary.
- AI and machine learning through a trained cost-per-mile model.
- Agentic AI patterns through a transparent multi-step recommendation agent.
- RAG, or Retrieval Augmented Generation, through a local searchable knowledge corpus.
- CI/CD through GitHub Actions.
- Version control readiness through a clean git project structure.
- SEO through metadata, sitemap, robots file, Open Graph metadata, and JSON-LD.
- Automation through repeatable build, test, and data-generation commands.

## Main User Experience

The app opens directly into an analytical dashboard. There is no marketing landing page. The first screen is the actual tool.

Users can:

- Pick a driving scenario such as city commuter, mixed household, high mileage fleet, public charging renter, or 2030 decarbonised grid.
- Adjust annual mileage.
- Adjust ownership period.
- Adjust home charging share.
- Adjust electricity price.
- Pick a UK EV electricity tariff or enter custom off-peak, peak, and standing-charge values.
- Refresh petrol and diesel prices from GOV.UK/DESNZ, then override them manually if needed.
- Filter by vehicle segment.
- Compare vehicles on a cost-versus-carbon chart.
- Review ranked vehicle results.
- View powertrain summaries.
- Inspect ML model metrics and feature importance.
- View signal-processing features from driving cycles.
- Preview live REST API output.
- Ask the Agentic RAG Advisor questions about the comparison.
- Search the trim-aware vehicle catalog by make, model, year, and trim.
- Try a live UK registration import endpoint when a DVLA API key is configured.
- See source-by-source value comparisons when imported DVLA data conflicts with the selected catalog trim.
- Review likely trim matches with confidence scores and plain-English match reasons.
- Browse the catalog across availability years instead of being limited to a single representative model year.

## Architecture

The project has four main layers.

### 1. Raw Data Layer

Raw inputs live in `data/raw`.

- `vehicles.csv`: curated UK demo vehicle trim records for EV, petrol, diesel, and petrol hybrid vehicles from the 2016-2026 window.
- `energy_prices.csv`: fuel and electricity price scenarios.
- `ev_tariffs.csv`: UK EV tariff references including off-peak rates, peak rates, standing charges, source dates, and conflict notes.
- `grid_intensity.csv`: UK grid carbon-intensity assumptions by year.
- `scenario_profiles.csv`: usage profiles such as mileage, ownership period, and driving mix.
- `driving_cycles.csv`: speed traces used for signal-processing features.

The dataset is transparent and replaceable. It is suitable for engineering demonstration, not purchase advice.

### 2. Python Data Pipeline

The main pipeline is `pipeline/ev_ice_pipeline/build.py`.

It performs:

- CSV ingestion with Pandas.
- EV and ICE energy-use calculations.
- Total cost of ownership modelling.
- Lifecycle emissions modelling.
- Break-even mileage calculations.
- Powertrain-level aggregation.
- Signal processing with SciPy over driving-cycle speed traces.
- ML training with scikit-learn using a Random Forest regressor.
- Feature importance extraction.
- RAG corpus generation.
- EV tariff corpus generation with source notes.
- Trim-aware vehicle catalog generation.
- JSON artifact generation.
- SQLite database generation.

Run it with:

```bash
npm run data:build
```

### 3. Generated Artifacts

The pipeline generates:

- `src/data/portfolio-dataset.json`: imported by the Next.js app.
- `public/data/portfolio-dataset.json`: publicly inspectable dataset.
- `data/processed/portfolio-dataset.json`: pipeline output artifact.
- `data/processed/ev_ice_comparison.sqlite`: SQL artifact.
- `ev_tariffs` table inside SQLite for energy-pricing analysis.

These artifacts show that the project can move data from raw sources into app-ready and database-ready forms.

### 4. Web Application And APIs

The frontend is a Next.js app in `src/app` and `src/components`.

Important routes:

- `/`: interactive dashboard.
- `/api/vehicles`: returns all vehicle records.
- `/api/scenarios`: returns scenario assumptions.
- `/api/comparisons`: returns calculated comparison rows and supports query overrides.
- `/api/tariffs`: returns UK EV tariff references with source metadata.
- `/api/prices/fuel`: refreshes average UK petrol and diesel prices from the GOV.UK/DESNZ weekly road fuel CSV.
- `/api/energy-comparison`: compares annual EV electricity cost against petrol and diesel fuel cost using tariff and fuel overrides.
- `/api/catalog`: returns the local make/model/year/trim catalog.
- `/api/import/dvla`: imports registration-level facts from DVLA Vehicle Enquiry when `DVLA_API_KEY` is configured.
- `/api/rag`: returns retrieved knowledge documents for a query.
- `/api/agent`: returns an agent-style recommendation with reasoning steps and citations.

Example:

```http
GET /api/comparisons?scenario=mixed_household&annualMiles=12000&ownershipYears=5
GET /api/catalog
GET /api/tariffs
GET /api/prices/fuel
GET /api/energy-comparison?tariffId=intelligent-octopus-go&annualMiles=12000
GET /api/import/dvla?registration=AB12CDE
GET /api/rag?q=Which vehicle is best for high mileage emissions?
GET /api/agent?q=I drive 22000 miles a year and want low running costs
```

## Vehicle Catalog And Trims

The project now models trims explicitly instead of hiding trim names inside a model string. Each vehicle record includes make, model, trim, model year, availability window, UK market status, body style, segment, powertrain, fuel type, price, efficiency, battery size where relevant, CO2, maintenance, insurance group, and depreciation assumptions.

Official UK sources are useful but incomplete for rich trim selection. DVLA Vehicle Enquiry can return registration-level facts such as make, year of manufacture, engine capacity, CO2 emissions, and fuel type. DVSA MOT data is excellent for make, model, odometer, fuel type, and MOT history. VCA/GOV.UK supports fuel and CO2 lookup. However, none of those official open routes reliably provide full consumer trim packs, option packs, or equipment levels. The app therefore uses a local trim-aware catalog for comparison and exposes a DVLA import endpoint for real-time enrichment.

When a DVLA lookup is compared with a selected catalog trim, the project returns a provenance report. Overlapping fields such as make, model year, fuel type, and CO2 are compared directly. If values conflict, both values are retained and labelled by source. Fields that exist in only one source are marked as source-only. Fields that cannot be compared, such as DVLA trim data, are marked as not comparable.

The import flow also ranks likely catalog trims. The matcher scores make, fuel type, model year, availability window, CO2 proximity, and optional model/trim hints, then returns confidence percentages and reasons. SQLite also includes `source_registry` and `vehicle_source_values` tables so the provenance story is visible in the data layer, not only in the UI.

The catalog filters use availability windows. This avoids the false impression that a trim only exists in its representative `model_year`; a 2016-2026 availability span is searchable year by year.

## UK Tariffs And Fuel Prices

The tariff feature uses `data/raw/ev_tariffs.csv` as a transparent seed dataset. It includes tariffs such as Intelligent Octopus Go, Octopus Go, EDF GoElectric, E.ON Next Drive, OVO Charge Anytime, British Gas EV Power, So Energy, Scottish Power, Good Energy, and Utility Warehouse.

Each tariff row keeps off-peak p/kWh, peak p/kWh where applicable, off-peak window, standing charge p/day, standing-charge scope, compatibility requirements, exit fees, source URL, source date, and secondary source notes. Where values differ between the current tariff table and the supplied transcript, the app keeps both notes visible rather than merging them into one unlabelled value.

Fuel prices are handled separately because they change frequently. `/api/prices/fuel` fetches the current GOV.UK/DESNZ weekly road fuel CSV at request time, returns petrol and diesel in pence/litre and GBP/litre, and includes the source URL, date, and whether fallback values were used.

## Production Readiness Pass

The project includes several deployment-oriented safeguards:

- `/api/health` returns dataset, catalog, source, and RAG counts for smoke checks.
- `/api/prices/fuel` returns live/fallback metadata so deployments can degrade gracefully when GOV.UK is unavailable.
- `next.config.ts` sets basic security headers and disables the powered-by header.
- DVLA import validates registration-like input, times out upstream requests, and handles non-JSON upstream failures.
- `src/app/error.tsx` provides a user-facing recovery boundary.
- `npm run security:audit` is part of the local `check` script and CI workflow.
- The CI workflow runs data build, Python tests, lint, TypeScript tests, audit, and a Next.js production build.

## AI And ML

### Machine Learning

The Python pipeline trains a Random Forest regressor to predict total cost per mile from vehicle and scenario features. The app displays model quality metrics and feature importance so the ML work is visible and explainable.

The model is intentionally lightweight and reproducible. It is meant to demonstrate ML workflow design rather than hide logic behind a black box.

### RAG

The pipeline builds a structured knowledge corpus from vehicles, scenarios, assumptions, powertrain summaries, model metrics, and signal-processing outputs.

The app and API can retrieve relevant documents from that corpus. This is a local sparse retrieval implementation, which keeps the project easy to run on Vercel. In a production extension, the same corpus could be embedded and stored in pgvector, Pinecone, Supabase Vector, or another vector database.

### Agentic AI

The agent layer performs a transparent multi-step workflow:

1. Classify the user's intent.
2. Pick the most relevant scenario.
3. Retrieve supporting documents from the RAG corpus.
4. Run deterministic comparison calculations.
5. Select a recommendation based on cost, emissions, or balanced criteria.
6. Return an answer with reasoning steps and citations.

This demonstrates agentic system design without requiring a paid LLM call for every page load. The project can later be connected to OpenAI, Vercel AI Gateway, Groq, or another provider if live natural-language generation is desired.

## Testing

Python tests live in `tests/python`.

They check:

- Dataset shape.
- EV use-phase emissions compared with petrol.
- SQLite artifact generation.

TypeScript tests live in `tests/web`.

They check:

- Core comparison calculations.
- Charging-price sensitivity.
- RAG retrieval.
- Agent recommendation structure.

Run all checks with:

```bash
npm run check
```

This command runs:

- Data build.
- Python tests.
- ESLint.
- TypeScript tests.
- Next.js production build.

## CI/CD

The GitHub Actions workflow is in `.github/workflows/ci.yml`.

On push or pull request, it:

- Checks out the repo.
- Installs Node.
- Installs Python.
- Installs dependencies.
- Builds data artifacts.
- Runs Python tests.
- Runs web linting.
- Runs TypeScript tests.
- Builds the Next.js app.

This gives the repo a clear CI/CD story for employers.

## Deployment

The project is configured for Vercel using:

- `vercel.json`
- Next.js standard build scripts
- SEO metadata in `src/app/layout.tsx`
- `robots.ts`
- `sitemap.ts`

Local development:

```bash
npm install
pip install -r requirements.txt
npm run data:build
npm run dev
```

Production check:

```bash
npm run check
```

Suggested public project name:

```text
ev-ice-intelligence-lab
```

The current GitHub remote is:

```text
https://github.com/passportpowell/ev-vs-ice-comparison
```

## Future Improvements

Strong next additions would be:

- Replace curated demo data with live or licensed datasets.
- Add user accounts and saved comparison scenarios.
- Add a hosted database such as Supabase Postgres.
- Add vector embeddings for the RAG corpus.
- Add LLM-generated narrative reports with citations.
- Add automated data-refresh jobs.
- Add Playwright end-to-end tests in CI.
- Add a downloadable PDF comparison report.
- Add map-based charging infrastructure analysis.
