"use client";

import { WorksWheel, type WorksWheelItem } from "@/components/ui/works-wheel";

/** Photos used on the landing page (src/pages/LandingPage.tsx). */
const PHOTO = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const WORKS: WorksWheelItem[] = [
  { title: "GST & TDS Reco Engine", image: PHOTO("photo-1554224155-6726b3ff858f") },
  { title: "Tally Connectors & Bridge", image: PHOTO("photo-1460925895917-afdab827c52f") },
  { title: "Returns Prep & 12M Filing", image: PHOTO("photo-1551288049-bebda4e38f71") },
  { title: "Statutory & Tax Audit", image: PHOTO("photo-1454165804606-c3d57bc86b40") },
  { title: "Income Tax & Regime Engine", image: PHOTO("photo-1450101499163-c8848c66ca85") },
  { title: "Monthly Audit Working Paper", image: PHOTO("photo-1504868584819-f8e8b4b6d7e3") },
  { title: "Tally Entries Maker", image: PHOTO("photo-1579621970563-ebec7560ff3e") },
  { title: "Practice & WIP Hub", image: PHOTO("photo-1486406146926-c627a92ad1ab") },
];

export default function WorksWheelDemo() {
  return (
    <div className="bg-background text-foreground h-screen w-full">
      <WorksWheel items={WORKS} label="Works '26" action="View" />
    </div>
  );
}
