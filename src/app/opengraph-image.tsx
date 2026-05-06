import { ImageResponse } from "next/og";

// Don't import the dataset here — it's a 15k-line JSON and pushes the
// Edge Function bundle past Vercel's Hobby-plan 1 MB limit. The numbers
// below come from the catalog (UK consumer cars + curated tariffs +
// scenario seed file) and only need updating when major catalog work
// happens, which is rare.
const HEADLINE_STATS = {
  vehicles: 200,   // representative trims for the scatter chart
  brands: 49,      // UK consumer-car brands in uk_vehicle_catalog.json
  scenarios: 5,    // mileage / ownership presets
  tariffs: 13,     // curated UK EV tariffs + 4 live Octopus products
};

export const runtime = "edge";
export const alt = "EV vs ICE Intelligence Lab — UK total cost of ownership comparison";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function OpenGraphImage() {
  const vehicleCount = HEADLINE_STATS.vehicles;
  const makes = HEADLINE_STATS.brands;
  const scenarioCount = HEADLINE_STATS.scenarios;
  const tariffCount = HEADLINE_STATS.tariffs;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0b1411 0%, #0f766e 60%, #2563eb 100%)",
          color: "#f8faf8",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: "64px 72px"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#d8ece8",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase"
          }}
        >
          <span
            style={{
              display: "flex",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(255,255,255,0.14)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22
            }}
          >
            EV
          </span>
          EV vs ICE Intelligence Lab
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            marginTop: 70
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: 1000
            }}
          >
            UK total cost of ownership
            <br />
            for {vehicleCount}+ EVs, hybrids &amp; ICE
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#d8ece8",
              maxWidth: 1000,
              lineHeight: 1.35
            }}
          >
            Live Octopus tariffs · National Grid carbon intensity · Python +
            scikit-learn pipeline · REST APIs
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            gap: 18
          }}
        >
          {[
            { label: "Vehicles", value: String(vehicleCount) },
            { label: "Brands", value: String(makes) },
            { label: "Scenarios", value: String(scenarioCount) },
            { label: "Live tariffs", value: String(tariffCount + 4) }
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "20px 22px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.18)"
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#bcd9d3"
                }}
              >
                {stat.label}
              </span>
              <span
                style={{
                  fontSize: 44,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
