import sqlite3

from pipeline.ev_ice_pipeline.build import (
    SQLITE_PATH,
    build_dataset,
    build_scenarios,
    read_inputs,
)


def test_pipeline_builds_expected_dataset_shape():
    dataset = build_dataset()

    assert len(dataset["vehicles"]) >= 50
    assert len(dataset["scenario_results"]) == (
        len(dataset["vehicles"]) * len(dataset["scenarios"])
    )
    assert len(dataset["rag_corpus"]) >= len(dataset["vehicles"])
    assert len(dataset["source_registry"]) >= 3
    assert all(vehicle["trim"] for vehicle in dataset["vehicles"])
    assert dataset["model"]["r2"] > 0.95


def test_ev_use_phase_emissions_are_lower_than_petrol_reference():
    inputs = read_inputs()
    results, _ = build_scenarios(inputs)
    mixed = results[results["scenario_id"] == "mixed_household"]
    ev = mixed[mixed["vehicle_id"] == "mg4-ev-long-range"].iloc[0]
    petrol = mixed[mixed["vehicle_id"] == "volkswagen-golf-etsi"].iloc[0]

    assert ev["use_phase_kgco2e"] < petrol["use_phase_kgco2e"]


def test_sqlite_artifact_contains_scenario_results():
    build_dataset()

    with sqlite3.connect(SQLITE_PATH) as conn:
        count = conn.execute("select count(*) from scenario_results").fetchone()[0]
        rag_count = conn.execute("select count(*) from rag_corpus").fetchone()[0]
        source_value_count = conn.execute(
            "select count(*) from vehicle_source_values"
        ).fetchone()[0]

    assert count > 0
    assert rag_count > 0
    assert source_value_count > 0
