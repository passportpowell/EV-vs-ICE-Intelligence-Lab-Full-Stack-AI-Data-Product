import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

const siteUrl = "https://ev-ice-intelligence-lab.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "EV vs ICE Intelligence Lab",
    template: "%s | EV vs ICE Intelligence Lab"
  },
  description:
    "Interactive EV, petrol, and diesel vehicle comparison dashboard with Python data processing, SQL outputs, REST APIs, and ML-assisted cost modelling.",
  applicationName: "EV vs ICE Intelligence Lab",
  authors: [{ name: "Passport Powell" }],
  keywords: [
    "EV comparison",
    "ICE vehicles",
    "electric vehicles",
    "Python data pipeline",
    "React dashboard",
    "vehicle emissions",
    "total cost of ownership"
  ],
  openGraph: {
    title: "EV vs ICE Intelligence Lab",
    description:
      "A portfolio-grade data product comparing electric, petrol, and diesel vehicles across cost, emissions, and usage scenarios.",
    url: siteUrl,
    siteName: "EV vs ICE Intelligence Lab",
    type: "website"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EV vs ICE Intelligence Lab",
    applicationCategory: "DataApplication",
    operatingSystem: "Web",
    description:
      "Interactive vehicle comparison dashboard with Python data processing, SQL storage, REST API routes, and machine learning model reporting."
  };

  return (
    <html lang="en-GB">
      <body>
        {children}
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
