import PerspectiveTunnelHero from "@/components/ui/perspective-tunnel-hero";

// Full-bleed demo: the hero sizes itself to the viewport (100svh) and
// positions cards from window dimensions, so it must not sit in a narrow wrapper.
export default function PerspectiveTunnelDemo() {
    return (
        <main className="min-h-screen w-full bg-stone-100 dark:bg-stone-950">
            <PerspectiveTunnelHero />
        </main>
    );
}
