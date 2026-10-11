import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { dataset } from "@/lib/data";
import { Footer } from "@/components/Footer";

import "./globals.css";

const siteUrl = "https://ev-ice-intelligence-lab.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "EV vs ICE Intelligence Lab — UK total cost of ownership comparison",
    template: "%s | EV vs ICE Intelligence Lab"
  },
  description:
    "Compare 200+ UK electric, petrol, diesel, and hybrid vehicles across total cost of ownership, lifecycle CO2e, energy use, and Octopus Energy tariffs. Live data, REST APIs, and ML-assisted cost modelling.",
  applicationName: "EV vs ICE Intelligence Lab",
  authors: [{ name: "Passport Powell" }],
  creator: "Passport Powell",
  publisher: "Passport Powell",
  category: "Automotive",
  keywords: [
    "UK EV comparison",
    "electric vs petrol cost",
    "total cost of ownership",
    "UK car emissions calculator",
    "Octopus Energy tariffs",
    "lifecycle CO2",
    "DVLA lookup",
    "EV TCO",
    "Python data pipeline",
    "Next.js dashboard"
  ],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "EV vs ICE Intelligence Lab",
    description:
      "Interactive UK total-cost-of-ownership comparison across 200+ vehicles, with live tariffs, grid carbon intensity, and a Python data pipeline.",
    url: siteUrl,
    siteName: "EV vs ICE Intelligence Lab",
    type: "website",
    locale: "en_GB"
  },
  twitter: {
    card: "summary_large_image",
    title: "EV vs ICE Intelligence Lab",
    description:
      "Compare 200+ UK vehicles across cost, emissions, and tariffs. Built with Next.js, scikit-learn, and live Octopus Energy + grid carbon APIs."
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EV vs ICE Intelligence Lab",
    applicationCategory: "DataApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Interactive UK vehicle comparison dashboard with Python data pipeline, SQL storage, Octopus Energy + Carbon Intensity API integrations, scikit-learn ML, and TF-IDF + LSA RAG advisor.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" }
  };

  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "UK EV vs ICE Vehicle Catalog",
    description:
      "Curated UK 2016-2026 catalog of EV, petrol, diesel, and hybrid trims with prices, efficiencies, lifecycle emissions, and depreciation estimates.",
    creator: { "@type": "Person", name: "Passport Powell" },
    license: "https://opensource.org/licenses/MIT",
    keywords: [
      "UK vehicles",
      "electric vehicles",
      "total cost of ownership",
      "lifecycle emissions"
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${siteUrl}/data/portfolio-dataset.json`
      }
    ],
    variableMeasured: [
      "purchase_price_gbp",
      "efficiency_value",
      "battery_kwh",
      "tailpipe_gco2_per_km",
      "manufacturing_gco2e_kg"
    ]
  };

  const featured = dataset.vehicles.slice(0, 10);
  const vehicleListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Featured UK Vehicles",
    itemListElement: featured.map((vehicle, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Car",
        name: `${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
        brand: { "@type": "Brand", name: vehicle.make },
        model: vehicle.model,
        modelDate: vehicle.model_year,
        vehicleEngine: {
          "@type": "EngineSpecification",
          fuelType: vehicle.fuel_type,
          ...(vehicle.battery_kwh
            ? { engineDisplacement: `${vehicle.battery_kwh} kWh battery` }
            : {})
        },
        fuelEfficiency: {
          "@type": "QuantitativeValue",
          value: vehicle.efficiency_value,
          unitText:
            vehicle.efficiency_unit === "kwh_per_100km"
              ? "kWh per 100km"
              : "litres per 100km"
        },
        emissionsCO2: vehicle.tailpipe_gco2_per_km,
        offers: {
          "@type": "Offer",
          price: vehicle.purchase_price_gbp,
          priceCurrency: "GBP"
        }
      }
    }))
  };

  return (
    <html lang="en-GB">
      <body>
        {children}
        <Footer />
        <Script
          id="ld-software"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
        />
        <Script
          id="ld-dataset"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetLd) }}
        />
        <Script
          id="ld-vehicles"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(vehicleListLd) }}
        />
      </body>
    </html>
  );
}
