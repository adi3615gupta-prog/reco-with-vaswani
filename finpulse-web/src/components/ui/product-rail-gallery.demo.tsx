"use client";

import ClothingRailHero from "@/components/ui/product-rail-gallery";
import type { RailGarment } from "@/components/ui/product-rail-gallery";

/** Photos used on the landing page (src/pages/LandingPage.tsx). */
const LANDING_PHOTOS = [
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
];

/** Module names from the Command Hub (src/components/ui/command-hub.tsx). */
const MODULES: { id: string; name: string; description: string }[] = [
  { id: "reco", name: "GST & TDS Reco Engine", description: "PR vs 2B matching (≤ ₹2 tol), party dispute hub, and TRACES 26Q TDS." },
  { id: "collector", name: "Tally Connectors & Bridge", description: "Direct HTTP Port 9000 connector, real-time XML parsers & auto-detect." },
  { id: "returns", name: "Returns Prep & 12M Filing", description: "12-month return cycles, Rule 88A set-off cascade & IMS recipient hub." },
  { id: "audit", name: "Statutory & Tax Audit", description: "SA 530 Monetary Unit Sampling, Form 3CD Clause 44 & Dual Depreciation." },
  { id: "tax", name: "Income Tax & Regime Engine", description: "Section 115BAC New vs Old regime, 25% surcharge cap & 87A rebate." },
  { id: "monthly-audit", name: "Monthly Audit Working Paper", description: "Standardized firm format, Maker-Checker review & Zero-Merge Excel." },
  { id: "tally-xml", name: "Tally Entries Maker", description: "Voucher ingestion, zero-telemetry XML generator & Port 9000 bridge." },
  { id: "wip", name: "Practice & WIP Hub", description: "Practice roster, 12M filing tracker, Financials & Bank CMA Credit & Ratios." },
];

export const RAIL_DEMO_ITEMS: RailGarment[] = MODULES.map((module, index) => ({
  id: module.id,
  name: module.name,
  description: module.description,
  image: LANDING_PHOTOS[index % LANDING_PHOTOS.length] as string,
}));

export default function ClothingRailHeroDemo({ autoplay = true }: { autoplay?: boolean }) {
  return (
    <div data-rail-demo className="flex min-h-svh w-full items-center justify-center bg-background text-foreground">
      <ClothingRailHero
        items={RAIL_DEMO_ITEMS}
        hanger="none"
        showNames
        eyebrow="Command Hub · Eight suites on the rail"
        heading="Eight suites, one place to start."
        caption="Tap a suite to see what it covers."
        autoplay={autoplay}
      />
    </div>
  );
}
