import type { Vehicle } from "@/lib/types";
import { vehicleDisplayName } from "@/lib/vehicles";

export type DvlaVehicleResponse = {
  registrationNumber?: string;
  make?: string;
  yearOfManufacture?: number;
  engineCapacity?: number;
  co2Emissions?: number;
  fuelType?: string;
  euroStatus?: string;
  colour?: string;
  motStatus?: string;
  taxStatus?: string;
};

export type NormalisedDvlaVehicle = {
  registration_number: string;
  make: string;
  model: string | null;
  trim: string | null;
  model_year: number | null;
  fuel_type: string | null;
  engine_capacity_cc: number | null;
  co2_g_per_km: number | null;
  euro_status: string | null;
  colour: string | null;
  mot_status: string | null;
  tax_status: string | null;
  trim_warning: string;
  source: string;
};

export type SourceComparisonStatus =
  | "match"
  | "conflict"
  | "dvla-only"
  | "catalog-only"
  | "not-comparable";

export type SourceComparison = {
  field: string;
  label: string;
  status: SourceComparisonStatus;
  values: Array<{
    source: string;
    value: string | number | null;
    note?: string;
  }>;
  message: string;
};

export type ProvenanceReport = {
  compared_with: {
    vehicle_id: string;
    vehicle: string;
    source: string;
  } | null;
  comparisons: SourceComparison[];
  conflicts: SourceComparison[];
  summary: string;
};

export type CatalogMatch = {
  vehicle_id: string;
  vehicle: string;
  make: string;
  model: string;
  trim: string;
  model_year: number;
  confidence: number;
  reasons: string[];
  provenance: ProvenanceReport;
};

export type MatchHints = {
  model?: string | null;
  trim?: string | null;
};

export function normaliseDvlaVehicle(
  vehicle: DvlaVehicleResponse
): NormalisedDvlaVehicle {
  return {
    registration_number: vehicle.registrationNumber ?? "",
    make: normaliseLabel(vehicle.make),
    model: null,
    trim: null,
    model_year: vehicle.yearOfManufacture ?? null,
    fuel_type: vehicle.fuelType ? vehicle.fuelType.toLowerCase() : null,
    engine_capacity_cc: vehicle.engineCapacity ?? null,
    co2_g_per_km: vehicle.co2Emissions ?? null,
    euro_status: vehicle.euroStatus ?? null,
    colour: vehicle.colour ?? null,
    mot_status: vehicle.motStatus ?? null,
    tax_status: vehicle.taxStatus ?? null,
    trim_warning:
      "DVLA Vehicle Enquiry returns registration-level facts but not consumer trim packs. Match make/year/fuel/CO2 against the local trim catalog or a commercial spec API.",
    source: "DVLA Vehicle Enquiry API"
  };
}

export function findCatalogMatches(
  dvla: NormalisedDvlaVehicle,
  vehicles: Vehicle[],
  hints: MatchHints = {},
  limit = 5
): CatalogMatch[] {
  return vehicles
    .map((vehicle) => {
      const score = scoreCatalogVehicle(dvla, vehicle, hints);
      return {
        vehicle_id: vehicle.id,
        vehicle: vehicleDisplayName(vehicle),
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        model_year: vehicle.model_year,
        confidence: Math.min(score.points, 100),
        reasons: score.reasons,
        provenance: compareDvlaWithCatalog(dvla, vehicle)
      };
    })
    .filter((match) => match.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export function compareDvlaWithCatalog(
  dvla: NormalisedDvlaVehicle,
  catalogVehicle?: Vehicle
): ProvenanceReport {
  if (!catalogVehicle) {
    const comparisons = [
      sourceOnly(
        "registration_number",
        "Registration",
        dvla.registration_number,
        dvla.source
      ),
      sourceOnly("make", "Make", dvla.make, dvla.source),
      sourceOnly("model_year", "Year", dvla.model_year, dvla.source),
      sourceOnly("fuel_type", "Fuel type", dvla.fuel_type, dvla.source),
      sourceOnly("co2_g_per_km", "CO2 g/km", dvla.co2_g_per_km, dvla.source),
      notComparable(
        "trim",
        "Trim",
        "DVLA does not provide consumer trim packs, so no trim conflict can be checked without a selected catalog trim."
      )
    ];

    return {
      compared_with: null,
      comparisons,
      conflicts: [],
      summary:
        "Imported DVLA values are shown without a local trim comparison. Select or pass a catalog vehicle ID to compare sources."
    };
  }

  const catalogSource = "Local UK trim catalog";
  const comparisons = [
    compareField("make", "Make", dvla.make, catalogVehicle.make, {
      dvlaSource: dvla.source,
      catalogSource
    }),
    compareField(
      "model_year",
      "Model year",
      dvla.model_year,
      catalogVehicle.model_year,
      {
        dvlaSource: dvla.source,
        catalogSource,
        tolerance: 0
      }
    ),
    compareField(
      "fuel_type",
      "Fuel type",
      normaliseFuel(dvla.fuel_type),
      normaliseFuel(catalogVehicle.fuel_type),
      {
        dvlaSource: dvla.source,
        catalogSource,
        displayDvlaValue: dvla.fuel_type,
        displayCatalogValue: catalogVehicle.fuel_type
      }
    ),
    compareField(
      "co2_g_per_km",
      "Tailpipe CO2 g/km",
      dvla.co2_g_per_km,
      catalogVehicle.tailpipe_gco2_per_km,
      {
        dvlaSource: dvla.source,
        catalogSource,
        tolerance: 3
      }
    ),
    notComparable(
      "model",
      "Model",
      "DVLA Vehicle Enquiry does not return a consumer model field. The catalog value is shown separately.",
      [
        { source: dvla.source, value: null },
        { source: catalogSource, value: catalogVehicle.model }
      ]
    ),
    notComparable(
      "trim",
      "Trim",
      "DVLA Vehicle Enquiry does not return trim. The selected catalog trim is shown separately.",
      [
        { source: dvla.source, value: null },
        { source: catalogSource, value: catalogVehicle.trim }
      ]
    ),
    sourceOnly("engine_capacity_cc", "Engine capacity", dvla.engine_capacity_cc, dvla.source),
    sourceOnly("euro_status", "Euro status", dvla.euro_status, dvla.source),
    sourceOnly(
      "catalog_efficiency",
      "Catalog efficiency",
      `${catalogVehicle.efficiency_value} ${
        catalogVehicle.efficiency_unit === "kwh_per_100km"
          ? "kWh/100km"
          : "L/100km"
      }`,
      catalogSource
    )
  ];
  const conflicts = comparisons.filter(
    (comparison) => comparison.status === "conflict"
  );

  return {
    compared_with: {
      vehicle_id: catalogVehicle.id,
      vehicle: vehicleDisplayName(catalogVehicle),
      source: catalogSource
    },
    comparisons,
    conflicts,
    summary:
      conflicts.length === 0
        ? "No overlapping DVLA/catalog conflicts were detected. Non-overlapping fields are still shown by source."
        : `${conflicts.length} conflicting overlapping field${
            conflicts.length === 1 ? "" : "s"
          } detected. Both source values are shown.`
  };
}

function scoreCatalogVehicle(
  dvla: NormalisedDvlaVehicle,
  vehicle: Vehicle,
  hints: MatchHints
): { points: number; reasons: string[] } {
  let points = 0;
  const reasons: string[] = [];

  if (dvla.make && sameText(dvla.make, vehicle.make)) {
    points += 35;
    reasons.push(`Make matches ${dvla.source}.`);
  }

  const dvlaFuel = normaliseFuel(dvla.fuel_type);
  const catalogFuel = normaliseFuel(vehicle.fuel_type);
  if (dvlaFuel && catalogFuel && dvlaFuel === catalogFuel) {
    points += 18;
    reasons.push("Fuel type agrees across sources.");
  }

  if (dvla.model_year !== null) {
    if (dvla.model_year === vehicle.model_year) {
      points += 18;
      reasons.push("Model year matches the catalog trim.");
    } else if (
      dvla.model_year >= vehicle.available_from_year &&
      dvla.model_year <= vehicle.available_to_year
    ) {
      points += 12;
      reasons.push("DVLA manufacture year sits within the trim availability window.");
    } else if (Math.abs(dvla.model_year - vehicle.model_year) <= 1) {
      points += 7;
      reasons.push("DVLA manufacture year is within one year of the catalog trim.");
    }
  }

  if (dvla.co2_g_per_km !== null) {
    const delta = Math.abs(dvla.co2_g_per_km - vehicle.tailpipe_gco2_per_km);
    if (delta <= 3) {
      points += 16;
      reasons.push("CO2 values are within 3 g/km.");
    } else if (delta <= 15) {
      points += 8;
      reasons.push("CO2 values are close but not identical.");
    } else {
      reasons.push("CO2 values differ materially, so the match is lower confidence.");
    }
  }

  if (hints.model && containsText(vehicle.model, hints.model)) {
    points += 10;
    reasons.push("User/model hint matches the catalog model.");
  }

  if (hints.trim && containsText(vehicle.trim, hints.trim)) {
    points += 5;
    reasons.push("User trim hint matches the catalog trim.");
  }

  if (dvla.engine_capacity_cc !== null) {
    reasons.push(
      "DVLA engine capacity is available, but the local trim catalog does not yet store engine cc."
    );
  }

  return { points, reasons };
}

function compareField(
  field: string,
  label: string,
  dvlaValue: string | number | null,
  catalogValue: string | number | null,
  options: {
    dvlaSource: string;
    catalogSource: string;
    tolerance?: number;
    displayDvlaValue?: string | number | null;
    displayCatalogValue?: string | number | null;
  }
): SourceComparison {
  const hasDvla = dvlaValue !== null && dvlaValue !== "";
  const hasCatalog = catalogValue !== null && catalogValue !== "";
  const values = [
    {
      source: options.dvlaSource,
      value: options.displayDvlaValue ?? dvlaValue
    },
    {
      source: options.catalogSource,
      value: options.displayCatalogValue ?? catalogValue
    }
  ];

  if (!hasDvla || !hasCatalog) {
    return {
      field,
      label,
      status: hasDvla ? "dvla-only" : "catalog-only",
      values,
      message: "Only one source provides this overlapping field."
    };
  }

  const matches =
    typeof dvlaValue === "number" && typeof catalogValue === "number"
      ? Math.abs(dvlaValue - catalogValue) <= (options.tolerance ?? 0)
      : String(dvlaValue).toLowerCase() === String(catalogValue).toLowerCase();

  return {
    field,
    label,
    status: matches ? "match" : "conflict",
    values,
    message: matches
      ? "Sources agree on this value."
      : "Sources disagree. Both values are preserved."
  };
}

function sourceOnly(
  field: string,
  label: string,
  value: string | number | null,
  source: string
): SourceComparison {
  return {
    field,
    label,
    status: source.includes("DVLA") ? "dvla-only" : "catalog-only",
    values: [{ source, value }],
    message: "This field is only provided by one source."
  };
}

function notComparable(
  field: string,
  label: string,
  message: string,
  values: SourceComparison["values"] = []
): SourceComparison {
  return {
    field,
    label,
    status: "not-comparable",
    values,
    message
  };
}

function sameText(a: string, b: string): boolean {
  return a.localeCompare(b, "en-GB", { sensitivity: "accent" }) === 0;
}

function containsText(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function normaliseFuel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  if (lower.includes("electric") && !lower.includes("hybrid")) {
    return "electric";
  }
  if (lower.includes("diesel")) {
    return "diesel";
  }
  if (lower.includes("petrol") || lower.includes("hybrid")) {
    return "petrol";
  }
  return lower;
}

function normaliseLabel(value?: string): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
