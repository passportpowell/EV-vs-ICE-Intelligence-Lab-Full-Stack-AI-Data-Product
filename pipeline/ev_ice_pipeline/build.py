from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy import signal
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "src" / "data"
PUBLIC_DATA = ROOT / "public" / "data"
SQLITE_PATH = PROCESSED / "ev_ice_comparison.sqlite"

MILES_TO_KM = 1.609344
PETROL_UPSTREAM_FACTOR = 1.18
DIESEL_UPSTREAM_FACTOR = 1.18


def read_inputs() -> dict[str, pd.DataFrame]:
    return {
        "vehicles": pd.read_csv(RAW / "vehicles.csv"),
        "energy_prices": pd.read_csv(RAW / "energy_prices.csv"),
        "ev_tariffs": pd.read_csv(RAW / "ev_tariffs.csv"),
        "grid_intensity": pd.read_csv(RAW / "grid_intensity.csv"),
        "scenario_profiles": pd.read_csv(RAW / "scenario_profiles.csv"),
        "driving_cycles": pd.read_csv(RAW / "driving_cycles.csv"),
    }


def adjusted_efficiency(vehicle: pd.Series, profile: pd.Series) -> float:
    urban_delta = (float(profile["urban_share_pct"]) - 42.0) / 100.0
    motorway_delta = (float(profile["motorway_share_pct"]) - 34.0) / 100.0
    base = float(vehicle["efficiency_value"])

    if vehicle["fuel_type"] == "electric":
        factor = 1.0 - (0.08 * urban_delta) + (0.14 * motorway_delta)
    else:
        factor = 1.0 + (0.12 * urban_delta) + (0.06 * motorway_delta)

    return round(max(base * factor, base * 0.82), 3)


def weighted_electricity_price(price: pd.Series) -> float:
    home_share = float(price["home_charging_share_pct"]) / 100.0
    return (
        home_share * float(price["home_electricity_gbp_per_kwh"])
        + (1.0 - home_share) * float(price["public_rapid_gbp_per_kwh"])
    )


def depreciation_cost(vehicle: pd.Series, years: float) -> float:
    three_year_fraction = float(vehicle["depreciation_3yr_pct"])
    ownership_fraction = 1.0 - ((1.0 - three_year_fraction) ** (years / 3.0))
    return float(vehicle["purchase_price_gbp"]) * min(ownership_fraction, 0.86)


def calculate_vehicle_scenario(
    vehicle: pd.Series,
    profile: pd.Series,
    price: pd.Series,
    grid_gco2e_per_kwh: float,
) -> dict[str, Any]:
    annual_miles = float(profile["annual_miles"])
    ownership_years = float(profile["ownership_years"])
    distance_km = annual_miles * ownership_years * MILES_TO_KM
    efficiency = adjusted_efficiency(vehicle, profile)

    if vehicle["fuel_type"] == "electric":
        energy_units = distance_km * efficiency / 100.0
        energy_cost = energy_units * weighted_electricity_price(price)
        use_phase_kg = energy_units * grid_gco2e_per_kwh / 1000.0
        energy_unit = "kWh"
    else:
        energy_units = distance_km * efficiency / 100.0
        fuel_price = float(price[f"{vehicle['fuel_type']}_gbp_per_litre"])
        energy_cost = energy_units * fuel_price
        upstream_factor = (
            DIESEL_UPSTREAM_FACTOR
            if vehicle["fuel_type"] == "diesel"
            else PETROL_UPSTREAM_FACTOR
        )
        use_phase_kg = (
            float(vehicle["tailpipe_gco2_per_km"]) * distance_km / 1000.0
        ) * upstream_factor
        energy_unit = "litres"

    maintenance_cost = float(vehicle["annual_maintenance_gbp"]) * ownership_years
    depreciation = depreciation_cost(vehicle, ownership_years)
    total_cost = depreciation + energy_cost + maintenance_cost
    lifecycle_kg = float(vehicle["manufacturing_gco2e_kg"]) + use_phase_kg
    total_miles = annual_miles * ownership_years

    return {
        "scenario_id": profile["scenario_id"],
        "vehicle_id": vehicle["id"],
        "make": vehicle["make"],
        "model": vehicle["model"],
        "trim": vehicle.get("trim", ""),
        "model_year": int(vehicle.get("model_year", 0)),
        "available_from_year": int(vehicle.get("available_from_year", 0)),
        "available_to_year": int(vehicle.get("available_to_year", 0)),
        "uk_market_status": vehicle.get("uk_market_status", ""),
        "body_style": vehicle.get("body_style", ""),
        "segment": vehicle["segment"],
        "powertrain": vehicle["powertrain"],
        "fuel_type": vehicle["fuel_type"],
        "annual_miles": annual_miles,
        "ownership_years": ownership_years,
        "adjusted_efficiency": efficiency,
        "efficiency_unit": vehicle["efficiency_unit"],
        "energy_unit": energy_unit,
        "energy_units_used": round(energy_units, 1),
        "energy_cost_gbp": round(energy_cost, 2),
        "maintenance_cost_gbp": round(maintenance_cost, 2),
        "depreciation_cost_gbp": round(depreciation, 2),
        "total_cost_gbp": round(total_cost, 2),
        "total_cost_per_mile_gbp": round(total_cost / total_miles, 3),
        "annual_energy_cost_gbp": round(energy_cost / ownership_years, 2),
        "use_phase_kgco2e": round(use_phase_kg, 1),
        "manufacturing_kgco2e": round(float(vehicle["manufacturing_gco2e_kg"]), 1),
        "lifecycle_kgco2e": round(lifecycle_kg, 1),
        "lifecycle_tonnes_co2e": round(lifecycle_kg / 1000.0, 2),
    }


def build_scenarios(inputs: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.DataFrame]:
    vehicles = inputs["vehicles"]
    prices = inputs["energy_prices"].set_index("price_scenario_id")
    grid = inputs["grid_intensity"].set_index("year")
    profiles = inputs["scenario_profiles"]

    rows: list[dict[str, Any]] = []
    scenario_rows: list[dict[str, Any]] = []
    for _, profile in profiles.iterrows():
        price = prices.loc[profile["price_scenario_id"]]
        grid_intensity = float(grid.loc[int(profile["grid_year"])]["uk_grid_gco2e_per_kwh"])
        scenario_rows.append(
            {
                **profile.to_dict(),
                "grid_gco2e_per_kwh": grid_intensity,
                "petrol_gbp_per_litre": float(price["petrol_gbp_per_litre"]),
                "diesel_gbp_per_litre": float(price["diesel_gbp_per_litre"]),
                "home_electricity_gbp_per_kwh": float(
                    price["home_electricity_gbp_per_kwh"]
                ),
                "public_rapid_gbp_per_kwh": float(price["public_rapid_gbp_per_kwh"]),
                "weighted_electricity_gbp_per_kwh": round(
                    weighted_electricity_price(price), 3
                ),
                "home_charging_share_pct": float(price["home_charging_share_pct"]),
            }
        )
        for _, vehicle in vehicles.iterrows():
            rows.append(calculate_vehicle_scenario(vehicle, profile, price, grid_intensity))

    return pd.DataFrame(rows), pd.DataFrame(scenario_rows)


def build_powertrain_summary(results: pd.DataFrame) -> pd.DataFrame:
    summary = (
        results.groupby(["scenario_id", "powertrain"], as_index=False)
        .agg(
            vehicles=("vehicle_id", "count"),
            avg_total_cost_per_mile_gbp=("total_cost_per_mile_gbp", "mean"),
            avg_total_cost_gbp=("total_cost_gbp", "mean"),
            avg_lifecycle_tonnes_co2e=("lifecycle_tonnes_co2e", "mean"),
            avg_annual_energy_cost_gbp=("annual_energy_cost_gbp", "mean"),
            avg_use_phase_kgco2e=("use_phase_kgco2e", "mean"),
        )
        .round(3)
    )
    return summary


def build_break_even(results: pd.DataFrame) -> pd.DataFrame:
    enriched = results.copy()
    enriched["break_even_miles_vs_segment_ice"] = np.nan

    for scenario_id, scenario_rows in enriched.groupby("scenario_id"):
        for segment, segment_rows in scenario_rows.groupby("segment"):
            ice_rows = segment_rows[segment_rows["fuel_type"] != "electric"]
            ev_rows = segment_rows[segment_rows["fuel_type"] == "electric"]
            if ice_rows.empty or ev_rows.empty:
                continue

            ice_reference = ice_rows.sort_values("total_cost_per_mile_gbp").iloc[0]
            ice_running_cost = (
                ice_reference["energy_cost_gbp"] + ice_reference["maintenance_cost_gbp"]
            ) / (ice_reference["annual_miles"] * ice_reference["ownership_years"])

            for idx, ev in ev_rows.iterrows():
                ev_running_cost = (
                    ev["energy_cost_gbp"] + ev["maintenance_cost_gbp"]
                ) / (ev["annual_miles"] * ev["ownership_years"])
                running_saving = ice_running_cost - ev_running_cost
                capital_delta = ev["depreciation_cost_gbp"] - ice_reference[
                    "depreciation_cost_gbp"
                ]
                if running_saving > 0:
                    enriched.loc[idx, "break_even_miles_vs_segment_ice"] = max(
                        capital_delta / running_saving,
                        0,
                    )

    enriched["break_even_miles_vs_segment_ice"] = enriched[
        "break_even_miles_vs_segment_ice"
    ].round(0)
    return enriched


def build_signal_features(cycles: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for cycle, frame in cycles.groupby("cycle"):
        frame = frame.sort_values("second")
        seconds = frame["second"].to_numpy(dtype=float)
        speed_mps = frame["speed_kph"].to_numpy(dtype=float) / 3.6
        window = 5 if len(speed_mps) >= 5 else len(speed_mps) | 1
        smooth = signal.savgol_filter(speed_mps, window_length=window, polyorder=2)
        acceleration = np.gradient(smooth, seconds)
        jerk = np.gradient(acceleration, seconds)

        stop_share = float(np.mean(speed_mps < 0.8))
        accel_volatility = float(np.std(acceleration))
        energy_stress = (accel_volatility * 70.0) + (np.max(speed_mps) * 1.6) + (
            stop_share * 18.0
        )
        rows.append(
            {
                "cycle": cycle,
                "samples": int(len(frame)),
                "avg_speed_kph": round(float(np.mean(speed_mps) * 3.6), 1),
                "max_speed_kph": round(float(np.max(speed_mps) * 3.6), 1),
                "stop_share_pct": round(stop_share * 100.0, 1),
                "peak_acceleration_mps2": round(float(np.max(acceleration)), 2),
                "peak_deceleration_mps2": round(float(np.min(acceleration)), 2),
                "jerk_rms": round(float(np.sqrt(np.mean(jerk**2))), 3),
                "energy_stress_score": round(float(energy_stress), 1),
            }
        )
    return pd.DataFrame(rows)


def build_rag_corpus(
    inputs: dict[str, pd.DataFrame],
    scenarios: pd.DataFrame,
    results: pd.DataFrame,
    summary: pd.DataFrame,
    signals: pd.DataFrame,
    model_report: dict[str, Any],
) -> pd.DataFrame:
    documents: list[dict[str, Any]] = []

    documents.append(
        rag_document(
            "project-overview",
            "Project overview and architecture",
            "architecture",
            ["portfolio", "python", "react", "sql", "api", "vercel", "ci"],
            "EV vs ICE Intelligence Lab is a portfolio-grade data product. "
            "It combines a Python data pipeline, Pandas data processing, "
            "NumPy and SciPy calculations, scikit-learn modelling, SQLite output, "
            "Next.js REST API routes, React dashboard components, SEO metadata, "
            "and GitHub Actions CI/CD.",
            "PROJECT_SUMMARY.md",
        )
    )

    documents.append(
        rag_document(
            "assumptions",
            "Data assumptions and limitations",
            "assumptions",
            ["assumptions", "demo data", "uk", "limitations"],
            "The seed dataset is a transparent UK demo dataset for engineering "
            "demonstration. It models ownership cost, energy cost, maintenance, "
            "depreciation, manufacturing emissions, use-phase emissions, grid "
            "carbon intensity, and driving mix. It is not vehicle purchase advice.",
            "data/raw",
        )
    )

    for _, vehicle in inputs["vehicles"].iterrows():
        trim = vehicle.get("trim", "")
        year = int(vehicle.get("model_year", 0))
        display_name = f"{vehicle['make']} {vehicle['model']} {trim}".strip()
        fuel_label = "electricity" if vehicle["fuel_type"] == "electric" else vehicle[
            "fuel_type"
        ]
        documents.append(
            rag_document(
                f"vehicle-{vehicle['id']}",
                f"{display_name} {year}",
                "vehicle",
                [
                    str(vehicle["make"]).lower(),
                    str(vehicle["segment"]).lower(),
                    str(vehicle["powertrain"]).lower(),
                    str(vehicle["fuel_type"]).lower(),
                ],
                f"{display_name} is a UK market {year} {vehicle['segment']} "
                f"{vehicle['powertrain']} trim using {fuel_label}. Purchase price "
                f"is GBP {vehicle['purchase_price_gbp']}. Efficiency is "
                f"{vehicle['efficiency_value']} {vehicle['efficiency_unit']}. "
                f"Manufacturing emissions are {vehicle['manufacturing_gco2e_kg']} "
                f"kgCO2e and annual maintenance is GBP "
                f"{vehicle['annual_maintenance_gbp']}.",
                "data/raw/vehicles.csv",
                {"vehicle_id": vehicle["id"]},
            )
        )

    for _, scenario in scenarios.iterrows():
        scenario_results = results[
            results["scenario_id"] == scenario["scenario_id"]
        ].sort_values("total_cost_per_mile_gbp")
        cheapest = scenario_results.iloc[0]
        cleanest = scenario_results.sort_values("lifecycle_tonnes_co2e").iloc[0]
        documents.append(
            rag_document(
                f"scenario-{scenario['scenario_id']}",
                f"Scenario: {scenario['label']}",
                "scenario",
                [
                    "scenario",
                    str(scenario["scenario_id"]).replace("_", " "),
                    str(scenario["label"]).lower(),
                ],
                f"The {scenario['label']} scenario uses {scenario['annual_miles']} "
                f"annual miles over {scenario['ownership_years']} years with "
                f"{scenario['urban_share_pct']} percent urban driving and "
                f"{scenario['motorway_share_pct']} percent motorway driving. "
                f"Grid intensity is {scenario['grid_gco2e_per_kwh']} gCO2e/kWh. "
                f"Weighted electricity price is GBP "
                f"{scenario['weighted_electricity_gbp_per_kwh']} per kWh. "
                f"The lowest-cost trim is {cheapest['make']} {cheapest['model']} "
                f"{cheapest.get('trim', '')} "
                f"at GBP {cheapest['total_cost_per_mile_gbp']} per mile. "
                f"The lowest lifecycle emissions trim is {cleanest['make']} "
                f"{cleanest['model']} {cleanest.get('trim', '')} at "
                f"{cleanest['lifecycle_tonnes_co2e']} "
                f"tonnes CO2e.",
                "data/raw/scenario_profiles.csv",
                {"scenario_id": scenario["scenario_id"]},
            )
        )

    for _, row in summary.iterrows():
        documents.append(
            rag_document(
                f"summary-{row['scenario_id']}-{row['powertrain']}",
                f"{row['powertrain']} summary for {row['scenario_id']}",
                "powertrain-summary",
                [
                    str(row["powertrain"]).lower(),
                    "cost",
                    "emissions",
                    str(row["scenario_id"]).replace("_", " "),
                ],
                f"In scenario {row['scenario_id']}, {row['powertrain']} vehicles "
                f"average GBP {row['avg_total_cost_per_mile_gbp']} per mile, "
                f"GBP {row['avg_total_cost_gbp']} total cost, "
                f"{row['avg_lifecycle_tonnes_co2e']} tonnes lifecycle CO2e, "
                f"and GBP {row['avg_annual_energy_cost_gbp']} annual energy cost.",
                "data/processed/powertrain_summary",
                {
                    "scenario_id": row["scenario_id"],
                    "powertrain": row["powertrain"],
                },
            )
        )

    for _, tariff in inputs["ev_tariffs"].iterrows():
        peak_rate = tariff.get("peak_p_per_kwh")
        secondary_note = clean_text_value(tariff.get("secondary_source_value_note", ""))
        tariff_notes = clean_text_value(tariff.get("notes", ""))
        peak_phrase = (
            f"and peak rate {peak_rate} p/kWh"
            if not pd.isna(peak_rate)
            else "with no separate peak EV rate because this is an add-on"
        )
        documents.append(
            rag_document(
                f"tariff-{tariff['tariff_id']}",
                f"{tariff['supplier']} {tariff['tariff_name']}",
                "energy-tariff",
                [
                    "ev tariff",
                    "electricity",
                    str(tariff["supplier"]).lower(),
                    str(tariff["tariff_category"]).replace("_", " "),
                    "standing charge",
                ],
                f"{tariff['supplier']} {tariff['tariff_name']} is a UK "
                f"{tariff['tariff_category']} tariff. The default off-peak "
                f"rate is {tariff['default_off_peak_p_per_kwh']} p/kWh "
                f"{peak_phrase}. The off-peak window is "
                f"{tariff['off_peak_start']} to {tariff['off_peak_end']} "
                f"for {tariff['off_peak_hours']} hours. Standing charge is "
                f"{tariff['standing_charge_p_per_day']} p/day with scope: "
                f"{tariff['standing_charge_scope']}. Source is "
                f"{tariff['source_name']} dated {tariff['source_date']}. "
                f"{secondary_note} {tariff_notes}",
                "data/raw/ev_tariffs.csv",
                {"tariff_id": tariff["tariff_id"]},
            )
        )

    signal_terms = "; ".join(
        f"{row['cycle']} has energy stress {row['energy_stress_score']} and "
        f"stop share {row['stop_share_pct']} percent"
        for _, row in signals.iterrows()
    )
    documents.append(
        rag_document(
            "signal-processing",
            "Signal processing over driving cycles",
            "signal-processing",
            ["signal processing", "scipy", "driving cycles", "speed", "jerk"],
            "SciPy signal processing smooths speed traces and extracts acceleration, "
            "deceleration, jerk RMS, stop share, and energy stress features. "
            f"{signal_terms}.",
            "data/raw/driving_cycles.csv",
        )
    )

    feature_terms = ", ".join(
        f"{item['feature']} ({item['importance']})"
        for item in model_report["feature_importance"][:6]
    )
    documents.append(
        rag_document(
            "ml-model",
            "Machine learning cost model",
            "machine-learning",
            ["machine learning", "ai", "random forest", "scikit-learn", "model"],
            f"The ML model predicts total cost per mile using a scikit-learn "
            f"RandomForestRegressor. It trains on {model_report['training_rows']} "
            f"synthetic scenario rows and evaluates on {model_report['test_rows']} "
            f"test rows. R2 is {model_report['r2']} and MAE is GBP "
            f"{model_report['mae_gbp_per_mile']} per mile. Top features are "
            f"{feature_terms}.",
            "pipeline/ev_ice_pipeline/build.py",
        )
    )

    documents.append(
        rag_document(
            "agentic-rag",
            "Agentic RAG advisor design",
            "agentic-ai",
            ["agentic ai", "rag", "retrieval", "planner", "citations"],
            "The Agentic RAG Advisor classifies a user query, chooses a scenario, "
            "retrieves relevant corpus documents, runs deterministic vehicle "
            "comparison calculations, selects a recommendation, and returns "
            "reasoning steps with citations. The design is local and explainable, "
            "with a clear upgrade path to vector search and LLM-generated reports.",
            "src/lib/agent.ts",
        )
    )

    return pd.DataFrame(documents)


def build_source_registry() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "source_id": "mse_ev_tariff_table",
                "source_name": "MoneySavingExpert EV tariff guide",
                "source_type": "current_web_reference",
                "refresh_mode": "manual refresh or scheduled scraper",
                "fields": json.dumps(
                    [
                        "supplier",
                        "tariff_name",
                        "off_peak_p_per_kwh",
                        "peak_p_per_kwh",
                        "off_peak_hours",
                        "exit_fee",
                    ]
                ),
                "conflict_policy": "Keep supplier/table/user-entered values side by side with source dates.",
            },
            {
                "source_id": "ofgem_price_cap",
                "source_name": "Ofgem electricity price cap",
                "source_type": "current_web_reference",
                "refresh_mode": "quarterly price cap update",
                "fields": json.dumps(
                    ["electricity_unit_rate", "electricity_standing_charge"]
                ),
                "conflict_policy": "Use as an average benchmark only; supplier and region-specific charges should remain visible.",
            },
            {
                "source_id": "desnz_weekly_fuel_prices",
                "source_name": "DESNZ weekly road fuel prices",
                "source_type": "live_csv",
                "refresh_mode": "server route fetches the latest GOV.UK CSV",
                "fields": json.dumps(["petrol_p_per_litre", "diesel_p_per_litre"]),
                "conflict_policy": "Return fetched values with source URL and fallback values when live refresh fails.",
            },
            {
                "source_id": "user_tariff_transcript",
                "source_name": "User supplied EV tariff transcript",
                "source_type": "local_reference",
                "refresh_mode": "manual",
                "fields": json.dumps(
                    ["tariff_name", "off_peak_rate", "off_peak_window", "standing_charge"]
                ),
                "conflict_policy": "Summarise source values and keep them as secondary notes rather than overwriting current tariff references.",
            },
            {
                "source_id": "local_trim_catalog",
                "source_name": "Local UK trim catalog",
                "source_type": "curated_seed_dataset",
                "refresh_mode": "repository pipeline",
                "fields": json.dumps(
                    [
                        "make",
                        "model",
                        "trim",
                        "model_year",
                        "fuel_type",
                        "tailpipe_gco2_per_km",
                        "efficiency_value",
                        "purchase_price_gbp",
                    ]
                ),
                "conflict_policy": "Keep all source values and label conflicts rather than overwriting.",
            },
            {
                "source_id": "dvla_vehicle_enquiry",
                "source_name": "DVLA Vehicle Enquiry API",
                "source_type": "live_api",
                "refresh_mode": "on demand by registration",
                "fields": json.dumps(
                    [
                        "registration_number",
                        "make",
                        "year_of_manufacture",
                        "fuel_type",
                        "engine_capacity_cc",
                        "co2_g_per_km",
                        "euro_status",
                    ]
                ),
                "conflict_policy": "Compare overlapping values with the selected catalog trim and return both values.",
            },
            {
                "source_id": "dvsa_mot_history",
                "source_name": "DVSA MOT history and anonymised test data",
                "source_type": "external_dataset",
                "refresh_mode": "future scheduled import",
                "fields": json.dumps(
                    ["make", "model", "fuel_type", "odometer", "test_date", "mot_result"]
                ),
                "conflict_policy": "Use as supporting evidence for usage and model text, not as trim authority.",
            },
            {
                "source_id": "vca_gov_uk_co2",
                "source_name": "VCA/GOV.UK fuel and CO2 data",
                "source_type": "external_lookup",
                "refresh_mode": "future scheduled import",
                "fields": json.dumps(["make", "model", "fuel_type", "co2_g_per_km"]),
                "conflict_policy": "Compare CO2 values by source and preserve disagreements.",
            },
        ]
    )


def build_vehicle_source_values(vehicles: pd.DataFrame) -> pd.DataFrame:
    tracked_fields = [
        "make",
        "model",
        "trim",
        "model_year",
        "fuel_type",
        "tailpipe_gco2_per_km",
        "efficiency_value",
        "purchase_price_gbp",
        "source_note",
    ]
    rows: list[dict[str, Any]] = []

    for _, vehicle in vehicles.iterrows():
        for field in tracked_fields:
            value = vehicle[field]
            rows.append(
                {
                    "vehicle_id": vehicle["id"],
                    "source_id": "local_trim_catalog",
                    "source_name": "Local UK trim catalog",
                    "field": field,
                    "value": str(value),
                    "numeric_value": float(value)
                    if isinstance(value, (int, float, np.integer, np.floating))
                    else None,
                    "provenance_status": "source-value",
                }
            )

    return pd.DataFrame(rows)


def rag_document(
    doc_id: str,
    title: str,
    category: str,
    tags: list[str],
    content: str,
    source: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": doc_id,
        "title": title,
        "category": category,
        "tags": tags,
        "content": " ".join(content.split()),
        "source": source,
        "metadata": metadata or {},
    }


def clean_text_value(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def synthetic_training_grid(inputs: dict[str, pd.DataFrame]) -> pd.DataFrame:
    vehicles = inputs["vehicles"]
    prices = inputs["energy_prices"]
    grid = inputs["grid_intensity"].set_index("year")

    records: list[dict[str, Any]] = []
    for _, vehicle in vehicles.iterrows():
        for _, price in prices.iterrows():
            for annual_miles in [6000, 9000, 12000, 16000, 22000, 28000]:
                for years in [3, 4, 5, 7, 9]:
                    for urban_share in [22, 42, 64, 78]:
                        motorway_share = max(10, min(66, 70 - urban_share // 2))
                        grid_year = 2030 if price["price_scenario_id"] == "low_carbon_power" else 2026
                        profile = pd.Series(
                            {
                                "scenario_id": "training",
                                "annual_miles": annual_miles,
                                "ownership_years": years,
                                "urban_share_pct": urban_share,
                                "motorway_share_pct": motorway_share,
                            }
                        )
                        target = calculate_vehicle_scenario(
                            vehicle,
                            profile,
                            price,
                            float(grid.loc[grid_year]["uk_grid_gco2e_per_kwh"]),
                        )
                        records.append(
                            {
            "segment": vehicle["segment"],
            "powertrain": vehicle["powertrain"],
            "fuel_type": vehicle["fuel_type"],
            "model_year": int(vehicle.get("model_year", 0)),
            "purchase_price_gbp": float(vehicle["purchase_price_gbp"]),
                                "efficiency_value": float(vehicle["efficiency_value"]),
                                "battery_kwh": float(vehicle["battery_kwh"]),
                                "annual_maintenance_gbp": float(
                                    vehicle["annual_maintenance_gbp"]
                                ),
                                "depreciation_3yr_pct": float(
                                    vehicle["depreciation_3yr_pct"]
                                ),
                                "annual_miles": float(annual_miles),
                                "ownership_years": float(years),
                                "urban_share_pct": float(urban_share),
                                "motorway_share_pct": float(motorway_share),
                                "home_charging_share_pct": float(
                                    price["home_charging_share_pct"]
                                ),
                                "petrol_gbp_per_litre": float(
                                    price["petrol_gbp_per_litre"]
                                ),
                                "diesel_gbp_per_litre": float(
                                    price["diesel_gbp_per_litre"]
                                ),
                                "weighted_electricity_gbp_per_kwh": weighted_electricity_price(
                                    price
                                ),
                                "total_cost_per_mile_gbp": target[
                                    "total_cost_per_mile_gbp"
                                ],
                            }
                        )
    return pd.DataFrame(records)


def train_cost_model(inputs: dict[str, pd.DataFrame]) -> dict[str, Any]:
    training = synthetic_training_grid(inputs)
    target_col = "total_cost_per_mile_gbp"
    categorical = ["segment", "powertrain", "fuel_type"]
    numeric = [col for col in training.columns if col not in categorical + [target_col]]

    x_train, x_test, y_train, y_test = train_test_split(
        training[categorical + numeric],
        training[target_col],
        test_size=0.24,
        random_state=42,
    )

    model = Pipeline(
        steps=[
            (
                "preprocess",
                ColumnTransformer(
                    transformers=[
                        ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
                        ("numeric", StandardScaler(), numeric),
                    ]
                ),
            ),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=260,
                    min_samples_leaf=3,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    preprocessor = model.named_steps["preprocess"]
    regressor = model.named_steps["model"]
    feature_names = preprocessor.get_feature_names_out()
    importances = sorted(
        zip(feature_names, regressor.feature_importances_, strict=True),
        key=lambda item: item[1],
        reverse=True,
    )[:8]

    sample = x_test.copy().head(8)
    sample_predictions = model.predict(sample)
    sample["actual_cost_per_mile_gbp"] = y_test.head(8).to_numpy()
    sample["predicted_cost_per_mile_gbp"] = sample_predictions

    return {
        "target": target_col,
        "training_rows": int(len(training)),
        "test_rows": int(len(x_test)),
        "r2": round(float(r2_score(y_test, predictions)), 3),
        "mae_gbp_per_mile": round(float(mean_absolute_error(y_test, predictions)), 3),
        "feature_importance": [
            {
                "feature": name.replace("categorical__", "").replace("numeric__", ""),
                "importance": round(float(score), 4),
            }
            for name, score in importances
        ],
        "sample_predictions": round_frame(sample, 3).to_dict(orient="records"),
    }


def round_frame(frame: pd.DataFrame, digits: int) -> pd.DataFrame:
    result = frame.copy()
    for col in result.select_dtypes(include=[np.number]).columns:
        result[col] = result[col].round(digits)
    return result


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if pd.isna(value):
        return None
    return value


def write_outputs(
    inputs: dict[str, pd.DataFrame],
    scenarios: pd.DataFrame,
    results: pd.DataFrame,
    summary: pd.DataFrame,
    signals: pd.DataFrame,
    rag_corpus: pd.DataFrame,
    source_registry: pd.DataFrame,
    vehicle_source_values: pd.DataFrame,
    model_report: dict[str, Any],
) -> dict[str, Any]:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)

    dataset = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project": {
            "name": "EV vs ICE Intelligence Lab",
            "slug": "ev-ice-intelligence-lab",
            "repository": "https://github.com/passportpowell/ev-vs-ice-comparison",
        },
        "assumptions": {
            "currency": "GBP",
            "market": "UK demo portfolio dataset",
            "distance": "Miles in UI, kilometres inside energy and emissions calculations",
            "ice_upstream_multiplier": PETROL_UPSTREAM_FACTOR,
            "note": "Seed data is intentionally transparent and replaceable. It is designed for portfolio engineering, not vehicle purchase advice.",
        },
        "vehicles": round_frame(inputs["vehicles"], 3).to_dict(orient="records"),
        "ev_tariffs": round_frame(inputs["ev_tariffs"], 3).to_dict(orient="records"),
        "scenarios": round_frame(scenarios, 3).to_dict(orient="records"),
        "scenario_results": round_frame(results, 3).to_dict(orient="records"),
        "powertrain_summary": round_frame(summary, 3).to_dict(orient="records"),
        "signal_processing": signals.to_dict(orient="records"),
        "rag_corpus": rag_corpus.to_dict(orient="records"),
        "source_registry": source_registry.to_dict(orient="records"),
        "model": model_report,
        "api_examples": [
            "/api/vehicles",
            "/api/scenarios",
            "/api/comparisons?scenario=mixed_household&annualMiles=12000&ownershipYears=5",
            "/api/tariffs",
            "/api/prices/fuel",
            "/api/energy-comparison?tariffId=intelligent-octopus-go&annualMiles=12000",
            "/api/rag?q=Which vehicle is best for high mileage emissions?",
            "/api/agent?q=I drive 22000 miles a year and want low running costs",
        ],
    }
    dataset = to_jsonable(dataset)

    json_text = json.dumps(dataset, indent=2)
    (PROCESSED / "portfolio-dataset.json").write_text(json_text + "\n", encoding="utf-8")
    (WEB_DATA / "portfolio-dataset.json").write_text(json_text + "\n", encoding="utf-8")
    (PUBLIC_DATA / "portfolio-dataset.json").write_text(json_text + "\n", encoding="utf-8")

    with sqlite3.connect(SQLITE_PATH) as conn:
        inputs["vehicles"].to_sql("vehicles", conn, if_exists="replace", index=False)
        inputs["ev_tariffs"].to_sql(
            "ev_tariffs", conn, if_exists="replace", index=False
        )
        scenarios.to_sql("scenarios", conn, if_exists="replace", index=False)
        results.to_sql("scenario_results", conn, if_exists="replace", index=False)
        summary.to_sql("powertrain_summary", conn, if_exists="replace", index=False)
        signals.to_sql("signal_processing", conn, if_exists="replace", index=False)
        source_registry.to_sql("source_registry", conn, if_exists="replace", index=False)
        vehicle_source_values.to_sql(
            "vehicle_source_values", conn, if_exists="replace", index=False
        )
        rag_table = rag_corpus.copy()
        rag_table["tags"] = rag_table["tags"].apply(json.dumps)
        rag_table["metadata"] = rag_table["metadata"].apply(json.dumps)
        rag_table.to_sql("rag_corpus", conn, if_exists="replace", index=False)
        model_table = pd.DataFrame(
            [
                {
                    **model_report,
                    "feature_importance": json.dumps(
                        model_report["feature_importance"]
                    ),
                    "sample_predictions": json.dumps(
                        model_report["sample_predictions"]
                    ),
                }
            ]
        )
        model_table.to_sql("model_report", conn, if_exists="replace", index=False)

    return dataset


def build_dataset() -> dict[str, Any]:
    inputs = read_inputs()
    results, scenarios = build_scenarios(inputs)
    results = build_break_even(results)
    summary = build_powertrain_summary(results)
    signals = build_signal_features(inputs["driving_cycles"])
    model_report = train_cost_model(inputs)
    rag_corpus = build_rag_corpus(
        inputs, scenarios, results, summary, signals, model_report
    )
    source_registry = build_source_registry()
    vehicle_source_values = build_vehicle_source_values(inputs["vehicles"])
    return write_outputs(
        inputs,
        scenarios,
        results,
        summary,
        signals,
        rag_corpus,
        source_registry,
        vehicle_source_values,
        model_report,
    )


def main() -> None:
    dataset = build_dataset()
    print(
        f"Built {len(dataset['scenario_results'])} comparison rows, "
        f"{len(dataset['vehicles'])} vehicles, "
        f"{len(dataset['rag_corpus'])} RAG documents, and {SQLITE_PATH.name}."
    )


if __name__ == "__main__":
    main()
