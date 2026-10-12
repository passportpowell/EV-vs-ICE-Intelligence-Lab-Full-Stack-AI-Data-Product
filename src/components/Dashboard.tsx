"use client";

import {
  BatteryCharging,
  Bot,
  BrainCircuit,
  Car,
  Database,
  Fuel,
  Gauge,
  GitBranch,
  Leaf,
  ListChecks,
  PlugZap,
  Search,
  Info,
  Download,
  Share2
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { ArchitectureModal } from "@/components/ArchitectureModal";
import { ChargingMap } from "@/components/ChargingMap";
import {
  VehicleFinder,
  type VehiclePick,
} from "@/components/VehicleFinder";
import {
  MetricTile,
  NumberField,
  PanelIntro,
  PanelTitle,
  RangeField,
  VehicleTooltip,
} from "@/components/dashboard/primitives";
import {
  formatDateLabel,
  formatSourceValue,
  labelise,
  money,
  roundForInput,
} from "@/lib/format";
import {
  bestByCost,
  bestByEmissions,
  calculateFleet,
  scenarioToOverrides,
  weightedElectricityPrice
} from "@/lib/calculations";
import { runPortfolioAgent } from "@/lib/agent";
import type { CatalogMatch, ProvenanceReport } from "@/lib/dvla";
import {
  blendedHomeTariffGbpPerKwh,
  tariffDisplayName,
  tariffRateInputFromTariff
} from "@/lib/tariffs";
import { vehicleDisplayName } from "@/lib/vehicles";
import type {
  PortfolioDataset,
  Scenario,
  ScenarioOverrides,
  ScenarioResult,
  FuelPriceSnapshot,
  TariffRateInput,
  Vehicle
} from "@/lib/types";

const POWERTRAIN_COLORS: Record<string, string> = {
  EV: "#0f766e",
  Petrol: "#b45309",
  Diesel: "#475569",
  "Petrol Hybrid": "#2563eb"
};

function SpecRanges({ pick }: { pick: NonNullable<VehiclePick> }) {
  const specs = pick.specs;
  if (!specs) {
    return (
      <small className="vehicle-spec-empty">
        Spec ranges not catalogued — enter your own in the panel below.
      </small>
    );
  }
  const chips: Array<{ label: string; value: string }> = [];
  const fmtRange = ([min, max]: [number, number], unit: string) =>
    min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  if (specs.battery_kwh) {
    chips.push({ label: "Battery", value: fmtRange(specs.battery_kwh, "kWh") });
  }
  if (specs.kwh_per_100km) {
    chips.push({
      label: "Efficiency",
      value: fmtRange(specs.kwh_per_100km, "kWh/100km"),
    });
  }
  if (specs.petrol_mpg_uk) {
    chips.push({
      label: "Petrol MPG",
      value: fmtRange(specs.petrol_mpg_uk, "mpg"),
    });
  }
  if (specs.diesel_mpg_uk) {
    chips.push({
      label: "Diesel MPG",
      value: fmtRange(specs.diesel_mpg_uk, "mpg"),
    });
  }
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="vehicle-spec-chips">
      {chips.map((chip) => (
        <span key={chip.label}>
          <em>{chip.label}</em>
          {chip.value}
        </span>
      ))}
    </div>
  );
}

function tariffRateSuffix(tariff: {
  off_peak_p_per_kwh: number | null;
  peak_p_per_kwh: number | null;
  unit_rate_p_per_kwh: number | null;
}): string {
  // Off-peak/peak split takes priority for EV smart tariffs.
  if (
    tariff.off_peak_p_per_kwh !== null &&
    tariff.off_peak_p_per_kwh !== tariff.peak_p_per_kwh
  ) {
    return ` (${tariff.off_peak_p_per_kwh.toFixed(1)}p off-peak)`;
  }
  if (tariff.unit_rate_p_per_kwh !== null) {
    return ` (${tariff.unit_rate_p_per_kwh.toFixed(1)}p)`;
  }
  // Multi-rate tariffs without a headline figure — leave it untagged.
  return " (multi-rate)";
}

type DashboardProps = {
  data: PortfolioDataset;
};

export function Dashboard({ data }: DashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Lazy initialisers below capture the URL params on first render and lock
  // them in. Subsequent renders see updated `searchParams` via the URL-sync
  // effect, but don't re-seed state (that's what we want — state drives the
  // URL after mount, not the other way around).
  const defaultScenario =
    data.scenarios.find((scenario) => scenario.scenario_id === "mixed_household") ??
    data.scenarios[0];
  const defaultTariff =
    data.ev_tariffs.find((tariff) => tariff.tariff_id === "intelligent-octopus-go") ??
    data.ev_tariffs[0];
  const defaultTariffInput: TariffRateInput = defaultTariff
    ? tariffRateInputFromTariff(defaultTariff)
    : {
        offPeakPPerKwh: 8,
        peakPPerKwh: 33.5,
        offPeakSharePct: 90,
        standingChargePPerDay: 57.21,
        standingChargeAllocationPct: 100
      };
  // First render must match the server's static output — use plain
  // defaults here, then a mount-only useEffect below pulls any URL
  // params into state. This keeps the dashboard hydration-safe.
  const [scenario, setScenario] = useState<Scenario>(defaultScenario);
  const [segment, setSegment] = useState("all");
  const [annualMiles, setAnnualMiles] = useState(defaultScenario.annual_miles);
  const [ownershipYears, setOwnershipYears] = useState(defaultScenario.ownership_years);
  const [homeShare, setHomeShare] = useState(
    defaultScenario.home_charging_share_pct
  );
  const [selectedTariffId, setSelectedTariffId] = useState(
    defaultTariff?.tariff_id ?? "custom"
  );
  const [offPeakRateP, setOffPeakRateP] = useState(
    defaultTariffInput.offPeakPPerKwh
  );
  const [peakRateP, setPeakRateP] = useState(defaultTariffInput.peakPPerKwh);
  const [offPeakShare, setOffPeakShare] = useState(
    defaultTariffInput.offPeakSharePct
  );
  const [standingChargeP, setStandingChargeP] = useState(
    defaultTariffInput.standingChargePPerDay
  );
  const [standingAllocation, setStandingAllocation] = useState(
    defaultTariffInput.standingChargeAllocationPct
  );
  const [petrolPrice, setPetrolPrice] = useState(defaultScenario.petrol_gbp_per_litre);
  const [dieselPrice, setDieselPrice] = useState(defaultScenario.diesel_gbp_per_litre);
  const [fuelSnapshot, setFuelSnapshot] = useState<FuelPriceSnapshot | null>(null);

  // Manual EV / ICE inputs for the energy-cost panel — anchored to the
  // *user*, not to a specific make/model. Sensible UK defaults:
  //   60 kWh ≈ Tesla Model 3 / VW ID.4 territory
  //   17 kWh / 100 km ≈ middle of the WLTP pack
  //   45 mpg ≈ typical UK petrol average
  //   55 mpg ≈ typical UK diesel average
  //   7 kW home wallbox is the standard UK EV install
  const [evBatteryKwh, setEvBatteryKwh] = useState(60);
  const [evEfficiencyKwh100km, setEvEfficiencyKwh100km] = useState(17);
  const [petrolMpgUk, setPetrolMpgUk] = useState(45);
  const [dieselMpgUk, setDieselMpgUk] = useState(55);
  const [chargerKw, setChargerKw] = useState(7);
  const [carbonSnapshot, setCarbonSnapshot] = useState<{
    forecast_gco2_per_kwh: number;
    actual_gco2_per_kwh: number | null;
    index: string;
    from: string;
    to: string;
    generation_mix: Array<{ fuel: string; percentage: number }>;
    source_name: string;
    source_url: string;
    stale: boolean;
  } | null>(null);
  type LiveOctopusTariff = {
    product_code: string;
    display_name: string;
    // Octopus returns null for multi-rate tariffs that have no single
    // headline unit rate (Cosy, Tracker, etc.) — every consumer must
    // guard against null on these three rate fields.
    unit_rate_p_per_kwh: number | null;
    off_peak_p_per_kwh: number | null;
    peak_p_per_kwh: number | null;
    standing_charge_p_per_day: number | null;
    is_green: boolean;
    description: string;
    source_url: string;
  };
  const [liveTariffs, setLiveTariffs] = useState<LiveOctopusTariff[]>([]);
  const [liveTariffsStale, setLiveTariffsStale] = useState(false);
  const [agentDraft, setAgentDraft] = useState("");
  // agentQuestion stays empty until the user actually asks — that way the
  // panel doesn't auto-render a pre-canned answer on first paint.
  const [agentQuestion, setAgentQuestion] = useState("");
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    data.vehicles[0]?.id ?? ""
  );
  // Live NHTSA-driven picks. Independent of the curated dataset — purely
  // a finder. Cost calculations live in the Tariffs panel which uses
  // manual inputs that work for any vehicle.
  const [yourVehicle, setYourVehicle] = useState<VehiclePick>(null);
  const [comparedVehicles, setComparedVehicles] = useState<VehiclePick[]>([
    null,
    null,
    null,
  ]);
  function setComparedAt(slot: number, pick: VehiclePick) {
    setComparedVehicles((prev) => {
      const next = [...prev];
      next[slot] = pick;
      return next;
    });
  }
  const [registration, setRegistration] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [provenanceReport, setProvenanceReport] =
    useState<ProvenanceReport | null>(null);
  const [matchResults, setMatchResults] = useState<CatalogMatch[]>([]);

  const selectedTariff = useMemo(
    () => data.ev_tariffs.find((tariff) => tariff.tariff_id === selectedTariffId),
    [data.ev_tariffs, selectedTariffId]
  );
  const tariffInput: TariffRateInput = useMemo(
    () => ({
      offPeakPPerKwh: offPeakRateP,
      peakPPerKwh: peakRateP,
      offPeakSharePct: offPeakShare,
      standingChargePPerDay: standingChargeP,
      standingChargeAllocationPct: standingAllocation
    }),
    [offPeakRateP, offPeakShare, peakRateP, standingAllocation, standingChargeP]
  );
  const effectiveHomeElectricity = useMemo(
    () => blendedHomeTariffGbpPerKwh(tariffInput),
    [tariffInput]
  );

  const overrides: ScenarioOverrides = useMemo(
    () => ({
      ...scenarioToOverrides(scenario),
      annualMiles,
      ownershipYears,
      homeChargingSharePct: homeShare,
      homeElectricityGbpPerKwh: effectiveHomeElectricity,
      petrolGbpPerLitre: petrolPrice,
      dieselGbpPerLitre: dieselPrice,
      evStandingChargeGbpPerDay: standingChargeP / 100,
      standingChargeAllocationPct: standingAllocation
    }),
    [
      annualMiles,
      dieselPrice,
      effectiveHomeElectricity,
      homeShare,
      ownershipYears,
      petrolPrice,
      scenario,
      standingAllocation,
      standingChargeP
    ]
  );

  // After hydration, pull any URL params into local state. Done in a
  // mount-only effect so the first client render matches the static
  // server output (no hydration mismatch on <select> options etc).
  // Cascading-render warnings don't apply here: the effect runs exactly
  // once, hydratedRef gates downstream effects, and the alternative
  // (lazy useState initialisers reading searchParams) was the bug.
  const hydratedRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const scenarioId = searchParams.get("scenario");
    if (scenarioId) {
      const next = data.scenarios.find((s) => s.scenario_id === scenarioId);
      if (next) setScenario(next);
    }
    const seg = searchParams.get("segment");
    if (seg) setSegment(seg);
    const veh = searchParams.get("vehicle");
    if (veh && data.vehicles.some((v) => v.id === veh)) {
      setSelectedVehicleId(veh);
    }
    const tariffId = searchParams.get("tariff");
    if (
      tariffId &&
      data.ev_tariffs.some((t) => t.tariff_id === tariffId)
    ) {
      setSelectedTariffId(tariffId);
    }
    hydratedRef.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Reflect scenario / segment / vehicle / tariff selection in the URL so
  // dashboard state is shareable. Default values stay omitted to keep links
  // clean. Skipped on the first render so we don't clobber URL params
  // before the mount-time read above has a chance to run.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const params = new URLSearchParams();
    if (scenario.scenario_id !== "mixed_household") {
      params.set("scenario", scenario.scenario_id);
    }
    if (segment !== "all") {
      params.set("segment", segment);
    }
    if (selectedVehicleId && selectedVehicleId !== data.vehicles[0]?.id) {
      params.set("vehicle", selectedVehicleId);
    }
    if (selectedTariffId && selectedTariffId !== "intelligent-octopus-go") {
      params.set("tariff", selectedTariffId);
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, {
        scroll: false,
      });
    }
  }, [
    data.vehicles,
    pathname,
    router,
    scenario.scenario_id,
    searchParams,
    segment,
    selectedTariffId,
    selectedVehicleId,
  ]);

  useEffect(() => {
    let active = true;
    fetch("/api/prices/fuel", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: FuelPriceSnapshot) => {
        if (!active) {
          return;
        }
        setFuelSnapshot(payload);
        if (
          Number.isFinite(payload.petrol_gbp_per_litre) &&
          Number.isFinite(payload.diesel_gbp_per_litre)
        ) {
          setPetrolPrice(payload.petrol_gbp_per_litre);
          setDieselPrice(payload.diesel_gbp_per_litre);
        }
      })
      .catch(() => {
        if (active) {
          setFuelSnapshot(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/prices/electricity?region=C", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        setLiveTariffs(payload.tariffs ?? []);
        setLiveTariffsStale(Boolean(payload.stale));
      })
      .catch(() => {
        if (active) {
          setLiveTariffs([]);
          setLiveTariffsStale(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/prices/carbon-intensity", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        setCarbonSnapshot(payload);
      })
      .catch(() => {
        if (active) setCarbonSnapshot(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const allRows = useMemo(
    () => calculateFleet(data.vehicles, overrides, scenario.scenario_id),
    [data.vehicles, overrides, scenario.scenario_id]
  );

  const rows = useMemo(
    () =>
      allRows
        .filter((row) => (segment === "all" ? true : row.segment === segment))
        .sort((a, b) => a.total_cost_per_mile_gbp - b.total_cost_per_mile_gbp),
    [allRows, segment]
  );

  const cheapest = bestByCost(rows);
  const cleanest = bestByEmissions(rows);
  const segments = useMemo(
    () => ["all", ...Array.from(new Set(data.vehicles.map((vehicle) => vehicle.segment)))],
    [data.vehicles]
  );
  const agentResult = useMemo(
    () => (agentQuestion ? runPortfolioAgent(data, agentQuestion) : null),
    [agentQuestion, data]
  );
  // Kept only as a stable anchor for the DVLA reg-import flow — every
  // user-facing picker is NHTSA-driven now.
  const selectedCatalogVehicle = (
    data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    data.vehicles[0]
  ) as Vehicle;
  const tariffSourceLabel = selectedTariff
    ? `${selectedTariff.source_name}, ${formatDateLabel(selectedTariff.source_date)}`
    : "User input";

  // Annual energy cost calculation purely from manual inputs.
  // Conversions:
  //   miles → km                     × 1.609344
  //   UK MPG → litres / 100 km        282.481 / mpg
  //   blended £/kWh                  off-peak share × off-peak + (1-share) × peak
  //   standing charge (allocated)    p/day × 365 × allocation% / 100
  const energyCostBreakdown = useMemo(() => {
    const km = annualMiles * 1.609344;
    const blendedPerKwhP =
      (offPeakShare / 100) * offPeakRateP +
      (1 - offPeakShare / 100) * peakRateP;
    const blendedPerKwhGbp = blendedPerKwhP / 100;
    const standingAnnualGbp =
      (standingChargeP * 365 * (standingAllocation / 100)) / 100;

    const annualKwh = (km * evEfficiencyKwh100km) / 100;
    const evCost = annualKwh * blendedPerKwhGbp + standingAnnualGbp;

    const petrolL100km = 282.481 / Math.max(petrolMpgUk, 1);
    const dieselL100km = 282.481 / Math.max(dieselMpgUk, 1);
    const annualPetrolL = (km * petrolL100km) / 100;
    const annualDieselL = (km * dieselL100km) / 100;
    const petrolCost = annualPetrolL * petrolPrice;
    const dieselCost = annualDieselL * dieselPrice;

    const milesPerYear = annualMiles || 1;
    return {
      blendedPerKwhP,
      ev: {
        annualGbp: evCost,
        annualKwh,
        pencePerMile: (evCost * 100) / milesPerYear,
        standingAnnualGbp,
      },
      petrol: {
        annualGbp: petrolCost,
        annualLitres: annualPetrolL,
        pencePerMile: (petrolCost * 100) / milesPerYear,
      },
      diesel: {
        annualGbp: dieselCost,
        annualLitres: annualDieselL,
        pencePerMile: (dieselCost * 100) / milesPerYear,
      },
    };
  }, [
    annualMiles,
    dieselMpgUk,
    dieselPrice,
    evEfficiencyKwh100km,
    offPeakRateP,
    offPeakShare,
    peakRateP,
    petrolMpgUk,
    petrolPrice,
    standingAllocation,
    standingChargeP,
  ]);

  // Charge-time estimate at the user's chosen connector speed. 50 kW
  // rapid only ever charges to ~80% before tapering — the standard
  // headline figure people quote.
  const chargeTimeHours = useMemo(() => {
    const fullEvFraction = chargerKw >= 50 ? 0.8 : 1;
    return (evBatteryKwh * fullEvFraction) / Math.max(chargerKw, 0.1);
  }, [chargerKw, evBatteryKwh]);

  const annualCostSavings = useMemo(() => {
    const ev = energyCostBreakdown.ev.annualGbp;
    const petrol = energyCostBreakdown.petrol.annualGbp;
    const diesel = energyCostBreakdown.diesel.annualGbp;
    const dearestIce = Math.max(petrol, diesel);
    return {
      saving: dearestIce - ev,
      dearestPowertrain: petrol >= diesel ? "petrol" : "diesel",
    };
  }, [energyCostBreakdown]);

  function applyScenario(nextScenarioId: string) {
    const nextScenario =
      data.scenarios.find((item) => item.scenario_id === nextScenarioId) ??
      defaultScenario;
    setScenario(nextScenario);
    setAnnualMiles(nextScenario.annual_miles);
    setOwnershipYears(nextScenario.ownership_years);
    setHomeShare(nextScenario.home_charging_share_pct);
    setPetrolPrice(nextScenario.petrol_gbp_per_litre);
    setDieselPrice(nextScenario.diesel_gbp_per_litre);
  }

  function applyTariff(nextTariffId: string) {
    setSelectedTariffId(nextTariffId);
    const nextTariff = data.ev_tariffs.find(
      (tariff) => tariff.tariff_id === nextTariffId
    );
    if (nextTariff) {
      const nextInput = tariffRateInputFromTariff(nextTariff);
      setOffPeakRateP(nextInput.offPeakPPerKwh);
      setPeakRateP(nextInput.peakPPerKwh);
      setOffPeakShare(nextInput.offPeakSharePct);
      setStandingChargeP(nextInput.standingChargePPerDay);
      setStandingAllocation(nextInput.standingChargeAllocationPct);
      return;
    }

    const liveTariff = liveTariffs.find(
      (tariff) => `live:${tariff.product_code}` === nextTariffId
    );
    if (liveTariff) {
      // Multi-rate Octopus products (Cosy, Tracker) have no single
      // headline rate — fall back to the existing field so we never
      // assign undefined to the numeric inputs.
      const offPeak =
        liveTariff.off_peak_p_per_kwh ??
        liveTariff.unit_rate_p_per_kwh ??
        offPeakRateP;
      const peak =
        liveTariff.peak_p_per_kwh ??
        liveTariff.unit_rate_p_per_kwh ??
        peakRateP;
      const isDualRate =
        liveTariff.off_peak_p_per_kwh !== null &&
        liveTariff.off_peak_p_per_kwh !== liveTariff.peak_p_per_kwh;
      setOffPeakRateP(offPeak);
      setPeakRateP(peak);
      setOffPeakShare(isDualRate ? 90 : 0);
      setStandingChargeP(liveTariff.standing_charge_p_per_day ?? standingChargeP);
      setStandingAllocation(100);
    }
  }

  function askAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentQuestion(agentDraft);
  }

  async function importDvlaVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportResult("Importing registration data...");
    setProvenanceReport(null);
    setMatchResults([]);

    try {
      const response = await fetch(
        `/api/import/dvla?registration=${encodeURIComponent(registration)}&vehicleId=${encodeURIComponent(selectedCatalogVehicle.id)}&model=${encodeURIComponent(selectedCatalogVehicle.model)}&trim=${encodeURIComponent(selectedCatalogVehicle.trim)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        setImportResult(
          [payload.error, payload.next_step].filter(Boolean).join(" ")
        );
        return;
      }
      setProvenanceReport(payload.provenance);
      setMatchResults(payload.matches ?? []);
      setImportResult(
        `${payload.vehicle.make || "Vehicle"} ${payload.vehicle.model_year ?? ""} ${payload.vehicle.fuel_type ?? ""} CO2 ${payload.vehicle.co2_g_per_km ?? "n/a"} g/km. ${payload.provenance.summary}`
      );
    } catch {
      setImportResult("Vehicle import failed before the request completed.");
    }
  }

  const [copiedLink, setCopiedLink] = useState(false);

  function copyScenarioLink() {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function exportComparisonCsv() {
    const headers = [
      "Vehicle",
      "Model Year",
      "Powertrain",
      "Segment",
      "Cost Per Mile (GBP)",
      "Lifecycle CO2e (tonnes)",
      "Annual Cost (GBP)",
      "Purchase Price (GBP)",
      "Efficiency",
    ];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) => {
        const v = data.vehicles.find((veh) => veh.id === r.vehicle_id);
        const purchasePrice = v?.purchase_price_gbp ?? "n/a";
        return [
          `"${r.make} ${r.model} ${r.trim}"`,
          r.model_year,
          r.powertrain,
          r.segment,
          r.total_cost_per_mile_gbp.toFixed(3),
          r.lifecycle_tonnes_co2e.toFixed(2),
          r.annual_energy_cost_gbp.toFixed(2),
          purchasePrice,
          r.adjusted_efficiency.toFixed(2),
        ].join(",");
      }),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `ev-vs-ice-${scenario.scenario_id}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Portfolio data product</p>
          <h1>EV vs ICE Intelligence Lab</h1>
        </div>
        <div className="topbar-actions" aria-label="Project capabilities">
          <button
            type="button"
            className="topbar-arch-btn"
            onClick={() => setIsArchModalOpen(true)}
            title="Inspect Data & ML Pipeline Architecture"
          >
            <Info size={16} aria-hidden />
            Architecture &amp; Pipeline
          </button>
          <span>
            <Database size={16} aria-hidden />
            SQL
          </span>
          <span>
            <BrainCircuit size={16} aria-hidden />
            ML
          </span>
          <span>
            <GitBranch size={16} aria-hidden />
            CI/CD
          </span>
          <button
            type="button"
            className="topbar-action-btn"
            onClick={copyScenarioLink}
            title="Copy current scenario URL to clipboard"
          >
            <Share2 size={16} aria-hidden />
            {copiedLink ? "Copied!" : "Share"}
          </button>
          <button
            type="button"
            className="topbar-action-btn"
            onClick={exportComparisonCsv}
            title="Export filtered vehicle comparison data as CSV"
          >
            <Download size={16} aria-hidden />
            Export CSV
          </button>
          <a className="topbar-link" href="/api/docs">
            <Database size={16} aria-hidden />
            API docs
          </a>
        </div>
      </header>

      <div className="hero-narrative-banner">
        <p>
          Portfolio prototype for vehicle cost and carbon comparisons, using Python models, source-dated weekly fuel prices, adjustable assumptions and an ONNX connector classifier.
        </p>
      </div>

      <section className="control-band" aria-label="Comparison controls">
        <label className="control-field">
          <span>Scenario</span>
          <select
            value={scenario.scenario_id}
            onChange={(event) => applyScenario(event.target.value)}
          >
            {data.scenarios.map((item) => (
              <option key={item.scenario_id} value={item.scenario_id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <RangeField
          label="Annual miles"
          value={annualMiles}
          min={5000}
          max={30000}
          step={500}
          suffix="mi"
          onChange={setAnnualMiles}
        />
        <RangeField
          label="Ownership"
          value={ownershipYears}
          min={2}
          max={10}
          step={1}
          suffix="yr"
          onChange={setOwnershipYears}
        />
        <RangeField
          label="Home charge"
          value={homeShare}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={setHomeShare}
        />
        <RangeField
          label="Cheap-rate charge"
          value={offPeakShare}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) => {
            setSelectedTariffId("custom");
            setOffPeakShare(value);
          }}
        />
      </section>

      <div className="driver-archetype-bar" aria-label="Driver profile presets">
        <span className="archetype-label">Quick presets:</span>
        <button
          type="button"
          className="archetype-btn"
          onClick={() => {
            setAnnualMiles(7400);
            setOwnershipYears(4);
            setHomeShare(85);
            setOffPeakShare(80);
          }}
        >
          UK Average Driver (7.4k mi · 85% home)
        </button>
        <button
          type="button"
          className="archetype-btn"
          onClick={() => {
            setAnnualMiles(18000);
            setOwnershipYears(3);
            setHomeShare(60);
            setOffPeakShare(70);
          }}
        >
          Fleet / High-Mileage (18k mi)
        </button>
        <button
          type="button"
          className="archetype-btn"
          onClick={() => {
            setAnnualMiles(4500);
            setOwnershipYears(6);
            setHomeShare(95);
            setOffPeakShare(90);
          }}
        >
          City Runabout (4.5k mi · 95% home)
        </button>
        <button
          type="button"
          className="archetype-btn"
          onClick={() => {
            setAnnualMiles(10000);
            setOwnershipYears(4);
            setHomeShare(0);
            setOffPeakShare(0);
          }}
        >
          Public Charger Only (0% home)
        </button>
      </div>

      <nav className="segment-tabs" aria-label="Vehicle segment">
        {segments.map((item) => (
          <button
            className={segment === item ? "active" : ""}
            key={item}
            onClick={() => setSegment(item)}
            type="button"
          >
            {item === "all" ? "All" : labelise(item)}
          </button>
        ))}
      </nav>

      <section className="metric-grid" aria-label="Scenario highlights">
        <MetricTile
          icon={<Gauge size={22} aria-hidden />}
          label="Lowest cost"
          value={cheapest ? vehicleDisplayName(cheapest) : "n/a"}
          detail={cheapest ? `${money(cheapest.total_cost_per_mile_gbp)}/mile` : ""}
        />
        <MetricTile
          icon={<PlugZap size={22} aria-hidden />}
          label="Cleanest lifecycle"
          value={cleanest ? vehicleDisplayName(cleanest) : "n/a"}
          detail={cleanest ? `${cleanest.lifecycle_tonnes_co2e} tCO2e` : ""}
        />
        <MetricTile
          icon={<BatteryCharging size={22} aria-hidden />}
          label="Blended electricity"
          value={`${money(weightedElectricityPrice(overrides))}/kWh`}
          detail={`${homeShare}% home, ${offPeakShare}% cheap-rate`}
        />
        <MetricTile
          icon={<Fuel size={22} aria-hidden />}
          label="Fuel prices"
          value={`${money(petrolPrice)} / ${money(dieselPrice)}`}
          detail={
            fuelSnapshot ? `petrol / diesel, GOV ${fuelSnapshot.date}` : "petrol / diesel per litre"
          }
        />
        <MetricTile
          icon={<Leaf size={22} aria-hidden />}
          label="Live grid CO2"
          value={
            carbonSnapshot
              ? `${Math.round(carbonSnapshot.forecast_gco2_per_kwh)} g/kWh`
              : "loading…"
          }
          detail={
            carbonSnapshot
              ? `${labelise(carbonSnapshot.index)} · ${
                  carbonSnapshot.generation_mix[0]?.fuel ?? "mix"
                } ${carbonSnapshot.generation_mix[0]?.percentage ?? 0}%`
              : "National Grid ESO API"
          }
        />
      </section>

      <section className="workspace-grid">
        <article className="panel panel-large">
          <PanelTitle icon={<Car size={18} aria-hidden />} title="Cost vs Lifecycle CO2e" />
          <PanelIntro>
            Each dot is a trim in the current filter. Bottom-left wins: cheap to run and clean.
          </PanelIntro>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={330}>
              <ScatterChart margin={{ top: 18, right: 24, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="#dfe5df" strokeDasharray="4 4" />
                <XAxis
                  dataKey="total_cost_per_mile_gbp"
                  name="Cost / mile"
                  unit="£"
                  tickFormatter={(value) => money(Number(value))}
                  type="number"
                />
                <YAxis
                  dataKey="lifecycle_tonnes_co2e"
                  name="Lifecycle CO₂e"
                  unit="t"
                  tickFormatter={(value) => `${value}t`}
                  type="number"
                />
                <Tooltip content={<VehicleTooltip />} />
                <Scatter
                  data={rows}
                  name="Vehicles"
                  cursor="pointer"
                  onClick={(node) => {
                    const payload = node?.payload as ScenarioResult | undefined;
                    if (!payload) return;
                    setSelectedVehicleId(payload.vehicle_id);
                    setYourVehicle({
                      make: payload.make,
                      year: payload.model_year,
                      model: payload.model,
                      powertrain: payload.powertrain as "EV" | "ICE" | "Hybrid" | "Mixed",
                    });
                  }}
                >
                  {rows.map((entry) => (
                    <Cell
                      fill={POWERTRAIN_COLORS[entry.powertrain] ?? "#334155"}
                      key={entry.vehicle_id}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="scatter-legend" aria-label="Powertrain legend">
              {Object.entries(POWERTRAIN_COLORS).map(([powertrain, color]) => (
                <span key={powertrain}>
                  <i style={{ background: color }} />
                  {powertrain}
                </span>
              ))}
              <small>X axis: total cost per mile · Y axis: lifecycle CO₂e in tonnes</small>
            </div>
          </div>
        </article>

        <article className="panel panel-full">
          <PanelTitle
            icon={<Car size={18} aria-hidden />}
            title="Pick a vehicle & compare"
          />
          <PanelIntro>
            Search 49 UK consumer-car brands and 600+ models, 2015–2026. Pick a
            make → year → model. Cost numbers live in the panel below using your
            manual specs (battery kWh, MPG, charger), so this works for any car.
          </PanelIntro>

          <div className="picker-row">
            <fieldset className="picker-block">
              <legend>Your vehicle</legend>
              <VehicleFinder
                label="UK consumer-car catalog"
                value={yourVehicle}
                onChange={setYourVehicle}
              />
            </fieldset>

            <fieldset className="picker-block">
              <legend>Compare with up to 3 alternatives</legend>
              <div className="compare-finder-stack">
                {[0, 1, 2].map((slot) => (
                  <VehicleFinder
                    key={slot}
                    label={`Compare with ${slot + 1}`}
                    value={comparedVehicles[slot]}
                    onChange={(pick) => setComparedAt(slot, pick)}
                    clearable
                  />
                ))}
              </div>
            </fieldset>
          </div>

          <div className="vehicle-summary">
            <div className="vehicle-summary-row primary">
              <span>You</span>
              <div className="vehicle-summary-body">
                <strong>
                  {yourVehicle
                    ? `${yourVehicle.year} ${yourVehicle.make} ${yourVehicle.model}`
                    : "Pick a make, year, and model above."}
                </strong>
                {yourVehicle ? <SpecRanges pick={yourVehicle} /> : null}
              </div>
            </div>
            {comparedVehicles.map((pick, idx) =>
              pick ? (
                <div className="vehicle-summary-row" key={idx}>
                  <span>vs</span>
                  <div className="vehicle-summary-body">
                    <strong>
                      {pick.year} {pick.make} {pick.model}
                    </strong>
                    <SpecRanges pick={pick} />
                  </div>
                </div>
              ) : null
            )}
            <p className="vehicle-summary-hint">
              Use the ranges above to tune the manual EV battery / efficiency
              / MPG inputs in the panel below — the EV vs petrol vs diesel
              cost cards refresh live.
            </p>
          </div>

          <details className="dvla-details">
            <summary>Or look up by UK registration (DVLA)</summary>
            <form className="dvla-form" onSubmit={importDvlaVehicle}>
              <input
                aria-label="UK registration"
                onChange={(event) => setRegistration(event.target.value)}
                placeholder="e.g. AB23 CDE"
                value={registration}
              />
              <button title="Import DVLA vehicle data" type="submit">
                <Search size={16} aria-hidden />
                <span>Import</span>
              </button>
            </form>
            {importResult ? <p className="import-result">{importResult}</p> : null}
            {matchResults.length > 0 ? (
              <div className="match-panel">
                <strong>Likely trim matches</strong>
                {matchResults.map((match) => (
                  <button
                    key={match.vehicle_id}
                    onClick={() => setSelectedVehicleId(match.vehicle_id)}
                    type="button"
                  >
                    <span>
                      <b>{match.vehicle}</b>
                      <small>{match.reasons.slice(0, 2).join(" ")}</small>
                    </span>
                    <em>{match.confidence}%</em>
                  </button>
                ))}
              </div>
            ) : null}
            {provenanceReport ? (
              <div className="provenance-panel">
                <strong>Source comparison</strong>
                <span>{provenanceReport.summary}</span>
                <div className="provenance-list">
                  {provenanceReport.comparisons.map((comparison) => (
                    <div
                      className={`provenance-row ${comparison.status}`}
                      key={comparison.field}
                    >
                      <div>
                        <b>{comparison.label}</b>
                        <small>{comparison.message}</small>
                      </div>
                      <div className="source-values">
                        {comparison.values.map((item) => (
                          <span key={`${comparison.field}-${item.source}`}>
                            <em>{item.source}</em>
                            {formatSourceValue(item.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </details>
        </article>

        <article className="panel panel-large">
          <PanelTitle
            icon={<PlugZap size={18} aria-hidden />}
            title="Annual energy cost — EV vs petrol vs diesel"
          />
          <PanelIntro>
            Punch in your battery size, charging window, and rough fuel
            economy. Calculations use your scenario&rsquo;s annual mileage and
            the source-dated weekly fuel prices or your manual overrides. No make or model required.
          </PanelIntro>

          <fieldset className="energy-input-group">
            <legend>Your EV setup</legend>
            <div className="energy-inputs">
              <NumberField
                label="Battery (kWh)"
                max={200}
                min={5}
                step={1}
                value={evBatteryKwh}
                onChange={setEvBatteryKwh}
              />
              <NumberField
                label="EV efficiency (kWh / 100km)"
                max={40}
                min={8}
                step={0.5}
                value={evEfficiencyKwh100km}
                onChange={setEvEfficiencyKwh100km}
              />
              <label className="tariff-field">
                <span>Home charger</span>
                <select
                  value={chargerKw}
                  onChange={(event) => setChargerKw(Number(event.target.value))}
                >
                  <option value={2.3}>3-pin domestic — 2.3 kW</option>
                  <option value={3.6}>Type 1 — 3.6 kW</option>
                  <option value={7}>Type 2 wallbox — 7 kW</option>
                  <option value={11}>Type 2 (3-phase) — 11 kW</option>
                  <option value={22}>Type 2 fast AC — 22 kW</option>
                  <option value={50}>Public DC rapid — 50 kW</option>
                </select>
              </label>
              <div className="charger-readout">
                <span>Full charge time</span>
                <strong>
                  {chargeTimeHours.toFixed(1)} h{chargerKw >= 50 ? " to 80%" : ""}
                </strong>
                <small>{evBatteryKwh} kWh ÷ {chargerKw} kW</small>
              </div>
            </div>
          </fieldset>

          <fieldset className="energy-input-group">
            <legend>Tariff &amp; charging window</legend>
            <div className="energy-inputs">
              <label className="tariff-field tariff-select">
                <span>
                  EV tariff
                  {liveTariffs.length > 0 ? (
                    <em className="live-tag" data-stale={liveTariffsStale}>
                      {liveTariffsStale ? "fallback" : "live"}
                    </em>
                  ) : null}
                </span>
                <select
                  onChange={(event) => applyTariff(event.target.value)}
                  value={selectedTariffId}
                >
                  {liveTariffs.length > 0 ? (
                    <optgroup
                      label={
                        liveTariffsStale
                          ? "Octopus (cached fallback)"
                          : "Octopus live (region C)"
                      }
                    >
                      {liveTariffs.map((tariff) => (
                        <option
                          key={tariff.product_code}
                          value={`live:${tariff.product_code}`}
                        >
                          {tariff.display_name}
                          {tariffRateSuffix(tariff)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="Curated UK tariffs">
                    {data.ev_tariffs.map((tariff) => (
                      <option key={tariff.tariff_id} value={tariff.tariff_id}>
                        {tariffDisplayName(tariff)}
                      </option>
                    ))}
                  </optgroup>
                  <option value="custom">Custom rates</option>
                </select>
              </label>
              <NumberField
                label="Off-peak p/kWh"
                max={80}
                min={0}
                step={0.1}
                value={offPeakRateP}
                onChange={(value) => {
                  setSelectedTariffId("custom");
                  setOffPeakRateP(value);
                }}
              />
              <NumberField
                label="Peak p/kWh"
                max={90}
                min={0}
                step={0.1}
                value={peakRateP}
                onChange={(value) => {
                  setSelectedTariffId("custom");
                  setPeakRateP(value);
                }}
              />
              <NumberField
                label="Standing p/day"
                max={120}
                min={0}
                step={0.1}
                value={standingChargeP}
                onChange={(value) => {
                  setSelectedTariffId("custom");
                  setStandingChargeP(value);
                }}
              />
              <RangeField
                label="Off-peak / night charging"
                max={100}
                min={0}
                step={5}
                suffix="%"
                value={offPeakShare}
                onChange={(value) => {
                  setSelectedTariffId("custom");
                  setOffPeakShare(value);
                }}
              />
              <div className="blended-readout">
                <span>Blended unit rate</span>
                <strong>
                  {energyCostBreakdown.blendedPerKwhP.toFixed(2)}p/kWh
                </strong>
              </div>
            </div>
          </fieldset>

          <fieldset className="energy-input-group">
            <legend>ICE comparison & fuel prices</legend>
            <div className="ice-inputs">
              <div className="ice-row">
                <NumberField
                  label="Petrol MPG (UK)"
                  max={120}
                  min={15}
                  step={1}
                  value={petrolMpgUk}
                  onChange={setPetrolMpgUk}
                />
                <NumberField
                  label="Petrol p/litre"
                  max={300}
                  min={80}
                  step={0.1}
                  value={roundForInput(petrolPrice * 100)}
                  onChange={(value) => setPetrolPrice(value / 100)}
                />
              </div>
              <div className="ice-row">
                <NumberField
                  label="Diesel MPG (UK)"
                  max={120}
                  min={15}
                  step={1}
                  value={dieselMpgUk}
                  onChange={setDieselMpgUk}
                />
                <NumberField
                  label="Diesel p/litre"
                  max={320}
                  min={80}
                  step={0.1}
                  value={roundForInput(dieselPrice * 100)}
                  onChange={(value) => setDieselPrice(value / 100)}
                />
              </div>
              <div className="fuel-source-readout">
                <span>UK weekly averages (source date)</span>
                <strong>
                  {fuelSnapshot
                    ? `${fuelSnapshot.source_name}, ${fuelSnapshot.date}${fuelSnapshot.stale ? " (stale or fallback)" : " (within 14-day policy)"}`
                    : "loading GOV.UK weekly fuel prices…"}
                </strong>
                {fuelSnapshot && (
                  <small>
                    {fuelSnapshot.note}{" "}
                    Checked {new Date(fuelSnapshot.fetched_at).toLocaleString("en-GB")}.{" "}
                    <a href={fuelSnapshot.source_url} target="_blank" rel="noopener noreferrer">Source CSV</a>
                  </small>
                )}
              </div>
            </div>
          </fieldset>

          <div className="energy-comparison-grid">
            <div
              className={
                yourVehicle?.powertrain === "EV"
                  ? "energy-card highlighted"
                  : "energy-card"
              }
            >
              <span>
                {yourVehicle?.powertrain === "EV"
                  ? "Your selection · electric"
                  : "Electric reference"}
              </span>
              <strong>
                {yourVehicle?.powertrain === "EV"
                  ? `${yourVehicle.year} ${yourVehicle.make} ${yourVehicle.model}`
                  : `EV at ${evBatteryKwh} kWh, ${evEfficiencyKwh100km} kWh/100km`}
              </strong>
              <b>{money(energyCostBreakdown.ev.annualGbp)}/yr</b>
              <small>
                {energyCostBreakdown.ev.pencePerMile.toFixed(1)}p/mile ·{" "}
                {Math.round(energyCostBreakdown.ev.annualKwh).toLocaleString(
                  "en-GB"
                )}{" "}
                kWh/yr
              </small>
              {energyCostBreakdown.ev.standingAnnualGbp > 0 ? (
                <em>
                  Includes {money(energyCostBreakdown.ev.standingAnnualGbp)}{" "}
                  standing charge
                </em>
              ) : (
                <em>
                  Charging mostly{" "}
                  {offPeakShare > 50 ? "overnight" : "during the day"}
                </em>
              )}
            </div>
            <div
              className={
                yourVehicle &&
                (yourVehicle.powertrain === "ICE" ||
                  yourVehicle.powertrain === "Hybrid" ||
                  yourVehicle.powertrain === "Mixed")
                  ? "energy-card highlighted"
                  : "energy-card"
              }
            >
              <span>
                {yourVehicle &&
                (yourVehicle.powertrain === "ICE" ||
                  yourVehicle.powertrain === "Hybrid" ||
                  yourVehicle.powertrain === "Mixed")
                  ? "Your selection · petrol"
                  : "Petrol reference"}
              </span>
              <strong>
                {yourVehicle &&
                (yourVehicle.powertrain === "ICE" ||
                  yourVehicle.powertrain === "Hybrid" ||
                  yourVehicle.powertrain === "Mixed")
                  ? `${yourVehicle.year} ${yourVehicle.make} ${yourVehicle.model}`
                  : `Petrol at ${petrolMpgUk} mpg`}
              </strong>
              <b>{money(energyCostBreakdown.petrol.annualGbp)}/yr</b>
              <small>
                {energyCostBreakdown.petrol.pencePerMile.toFixed(1)}p/mile ·{" "}
                {Math.round(energyCostBreakdown.petrol.annualLitres).toLocaleString(
                  "en-GB"
                )}{" "}
                L/yr
              </small>
              <em>
                {petrolMpgUk} mpg · {(petrolPrice * 100).toFixed(1)}p/litre
              </em>
            </div>
            <div className="energy-card">
              <span>Diesel reference</span>
              <strong>Diesel at {dieselMpgUk} mpg</strong>
              <b>{money(energyCostBreakdown.diesel.annualGbp)}/yr</b>
              <small>
                {energyCostBreakdown.diesel.pencePerMile.toFixed(1)}p/mile ·{" "}
                {Math.round(energyCostBreakdown.diesel.annualLitres).toLocaleString(
                  "en-GB"
                )}{" "}
                L/yr
              </small>
              <em>
                {dieselMpgUk} mpg · {(dieselPrice * 100).toFixed(1)}p/litre
              </em>
            </div>
          </div>

          {comparedVehicles.some(Boolean) ? (
            <div className="comparison-targets">
              <span className="comparison-targets-label">
                Also considering
              </span>
              <ul>
                {comparedVehicles.map((pick, idx) =>
                  pick ? (
                    <li key={idx}>
                      <strong>
                        {pick.year} {pick.make} {pick.model}
                      </strong>
                      <em>{pick.powertrain}</em>
                    </li>
                  ) : null
                )}
              </ul>
              <p className="comparison-targets-hint">
                These names are tracked here so you remember what you&rsquo;re
                weighing up. To compare cost-per-mile precisely, swap the
                inputs above to that vehicle&rsquo;s battery / MPG and the
                cards refresh.
              </p>
            </div>
          ) : null}

          {annualCostSavings.saving > 1 ? (
            <p className="savings-line">
              The EV saves{" "}
              <strong>{money(annualCostSavings.saving)}/yr</strong> vs the{" "}
              {annualCostSavings.dearestPowertrain} equivalent at{" "}
              {annualMiles.toLocaleString("en-GB")} miles a year.
            </p>
          ) : annualCostSavings.saving < -1 ? (
            <p className="savings-line">
              At your inputs the {annualCostSavings.dearestPowertrain}{" "}
              equivalent is actually cheaper by{" "}
              <strong>{money(Math.abs(annualCostSavings.saving))}/yr</strong>.
              Try a lower off-peak rate or a higher off-peak share.
            </p>
          ) : null}

          <div className="source-strip">
            {selectedTariff?.source_url ? (
              <a href={selectedTariff.source_url} rel="noreferrer" target="_blank">
                {tariffSourceLabel}
              </a>
            ) : (
              <span>{tariffSourceLabel}</span>
            )}
            <span>
              Standing:{" "}
              {selectedTariff?.standing_charge_source ?? "custom user value"}
            </span>
          </div>
          {selectedTariff?.secondary_source_value_note ? (
            <p className="tariff-note">{selectedTariff.secondary_source_value_note}</p>
          ) : null}
        </article>

        <ChargingMap cvModel={data.cv_model} />

        <article className="panel panel-full">
          <PanelTitle icon={<Bot size={18} aria-hidden />} title="Ask the dataset" />
          <PanelIntro>
            Ask in plain English. The advisor retrieves matching docs, picks a scenario, runs the calculation, and shows its sources.
          </PanelIntro>
          <form className="agent-form" onSubmit={askAgent}>
            <input
              aria-label="Agent question"
              onChange={(event) => setAgentDraft(event.target.value)}
              placeholder="e.g. low cost EV for 8000 miles a year"
              value={agentDraft}
            />
            <button title="Run advisor" type="submit">
              <Search size={16} aria-hidden />
              <span>Ask</span>
            </button>
          </form>
          {agentResult ? (
            <>
              <p className="agent-answer">{agentResult.answer}</p>
              {agentResult.recommendation ? (
                <div className="agent-recommendation">
                  <strong>{agentResult.recommendation.vehicle}</strong>
                  <span>{agentResult.recommendation.reason}</span>
                </div>
              ) : null}
              <div className="agent-grid">
                <div>
                  <div className="mini-title">
                    <ListChecks size={15} aria-hidden />
                    Steps
                  </div>
                  <ol className="agent-steps">
                    {agentResult.steps.map((step) => (
                      <li key={step.step}>
                        <strong>{step.action}</strong>
                        <span>{step.observation}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <div className="mini-title">
                    <Database size={15} aria-hidden />
                    Citations
                  </div>
                  <div className="citation-list">
                    {agentResult.citations.map((hit) => (
                      <a
                        href={`/api/rag?q=${encodeURIComponent(agentQuestion)}`}
                        key={hit.id}
                      >
                        <strong>{hit.title}</strong>
                        <span>{hit.source}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="agent-empty">
              Type a question above and the advisor will retrieve, plan, and
              cite its working below.
            </p>
          )}
        </article>

      </section>

      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </main>
  );
}

