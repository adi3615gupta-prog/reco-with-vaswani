"use client";

import {
    motion,
    useTransform,
    useReducedMotion,
    useMotionValue,
    useScroll,
    useSpring,
    MotionValue,
} from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const unsplash = (id: string) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=80`;

export interface TunnelImage {
    src: string;
    title: string;
}

const DEFAULT_IMAGES: TunnelImage[] = [
    { src: unsplash("1506905925346-21bda4d32df4"), title: "Chroma I" },
    { src: unsplash("1469474968028-56623f02e42e"), title: "Prism III" },
    { src: unsplash("1441974231531-c6227db76b6e"), title: "Ether IV" },
    { src: unsplash("1501785888041-af3ef285b470"), title: "Quantum V" },
    { src: unsplash("1470071459604-3b5ec3a7fe05"), title: "Nebula VI" },
    { src: unsplash("1518837695005-2083093ee35b"), title: "Cyber VII" },
    { src: unsplash("1500530855697-b586d89ba3ee"), title: "Flux VIII" },
    { src: unsplash("1447752875215-b2761acb3c5d"), title: "Aether IX" },
    { src: unsplash("1433086966358-54859d0ed716"), title: "Chroma X" },
];

interface TunnelCardData {
    item: TunnelImage;
    angleCos: number;
    angleSin: number;
    radiusFactorX: number;
    radiusFactorY: number;
    rotationZ: number;
    index: number;
}

const buildTunnelCards = (images: TunnelImage[]): TunnelCardData[] => images.map((item, i) => {
    const goldenAngle = i * 137.5 * (Math.PI / 180);
    const radiusFactorX = 0.28 + (i % 3) * 0.08;
    const radiusFactorY = 0.26 + (i % 2) * 0.09;

    return {
        item,
        angleCos: Math.cos(goldenAngle),
        angleSin: Math.sin(goldenAngle),
        radiusFactorX,
        radiusFactorY,
        rotationZ: (i % 2 === 0 ? 1 : -1) * (3 + (i % 5) * 2),
        index: i,
    };
});

const SPRING_CONFIG = { stiffness: 60, damping: 25, mass: 0.5 };

interface StageDimensions {
    width: number;
    height: number;
    isMobile: boolean;
}

function useCameraParallax(enabled: boolean) {
    const rawX = useMotionValue(0);
    const rawY = useMotionValue(0);
    const x = useSpring(rawX, SPRING_CONFIG);
    const y = useSpring(rawY, SPRING_CONFIG);

    useEffect(() => {
        if (!enabled) return;
        const onMove = (e: PointerEvent) => {
            rawX.set((e.clientX / window.innerWidth - 0.5) * 2);
            rawY.set((e.clientY / window.innerHeight - 0.5) * 2);
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => window.removeEventListener("pointermove", onMove);
    }, [enabled, rawX, rawY]);

    return { x, y };
}

interface TunnelCardProps {
    card: TunnelCardData;
    progress: MotionValue<number>;
    pointer: { x: MotionValue<number>; y: MotionValue<number> };
    total: number;
    stage: StageDimensions;
}

function TunnelCard({ card, progress, pointer, total, stage }: TunnelCardProps) {
    const staggerSpan = 0.55;
    const start = (card.index / total) * (1 - staggerSpan);
    const end = start + staggerSpan;

    const localProgress = useTransform(progress, [start, end], [0, 1]);

    const farZ = stage.isMobile ? -1200 : -1700;
    const nearZ = stage.isMobile ? 350 : 500;
    const z = useTransform(localProgress, [0, 1], [farZ, nearZ]);

    const opacity = useTransform(localProgress, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0]);

    const cardWidth = stage.isMobile
        ? Math.max(130, Math.min(180, stage.width * 0.38))
        : Math.max(180, Math.min(270, stage.width * 0.18));

    const baseX = card.angleCos * (stage.width * card.radiusFactorX);
    const baseY = card.angleSin * (stage.height * card.radiusFactorY);
    const panStrength = stage.isMobile ? 20 : 45;

    const transform = useTransform(
        [z, pointer.x, pointer.y],
        ([currZ, px, py]: number[]) => {
            const offsetX = baseX - px * panStrength;
            const offsetY = baseY - py * panStrength;
            return `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), ${currZ}px) rotateZ(${card.rotationZ}deg)`;
        }
    );

    return (
        <motion.div
            style={{
                width: cardWidth,
                transform,
                opacity,
                zIndex: card.index + 1,
            }}
            className="pointer-events-auto absolute left-1/2 top-1/2 aspect-[4/5] will-change-transform select-none cursor-pointer"
        >
            <div className="group relative h-full w-full overflow-hidden rounded-2xl bg-neutral-200 dark:bg-neutral-900 shadow-2xl shadow-neutral-950/20 dark:shadow-black/90 ring-1 ring-black/10 dark:ring-white/15 transition-all duration-500 hover:ring-indigo-500/70 dark:hover:ring-indigo-400/70 hover:shadow-indigo-500/25">
                <img
                    src={card.item.src}
                    alt={card.item.title}
                    draggable={false}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex items-end p-4 sm:p-5">
                    <span className="text-xs sm:text-sm font-mono tracking-widest uppercase text-white/95 drop-shadow-md">
                        {card.item.title}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

export interface PerspectiveTunnelHeroProps {
    images?: TunnelImage[];
    eyebrow?: string;
    title?: ReactNode;
    description?: string;
    scrollPrompt?: string;
    /** Use "h2" when the page already has its own h1. */
    headingAs?: "h1" | "h2";
    /** Merged onto the full-screen stage. */
    className?: string;
    /**
     * Pinned mode: the stage sticks to the viewport while the page scrolls
     * through `scrollLength` screens of height, and the tunnel follows native
     * page scroll. When the track ends, the content below scrolls in as usual.
     * Omit for the self-contained mode (wheel / swipe / arrow keys).
     */
    scrollLength?: number;
}

export default function PerspectiveTunnelHero({
    images = DEFAULT_IMAGES,
    eyebrow = "Warp Drive Sequence",
    title = (
        <>
            INTO THE
            <br />
            ETHER.
        </>
    ),
    description = "Scroll, swipe, or use the arrow keys to fly through the spatial 3D corridor.",
    scrollPrompt = "Scroll to Explore",
    headingAs: Heading = "h1",
    className,
    scrollLength,
}: PerspectiveTunnelHeroProps = {}) {
    const pinned = scrollLength !== undefined && scrollLength > 1;
    const containerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLElement>(null);
    const tunnelCards = useMemo(() => buildTunnelCards(images), [images]);
    const reduce = useReducedMotion();

    const [stage, setStage] = useState<StageDimensions>({
        width: 1440,
        height: 900,
        isMobile: false,
    });

    useEffect(() => {
        const updateDimensions = () => {
            setStage({
                width: window.innerWidth,
                height: window.innerHeight,
                isMobile: window.innerWidth < 768,
            });
        };

        updateDimensions();
        window.addEventListener("resize", updateDimensions);
        return () => window.removeEventListener("resize", updateDimensions);
    }, []);

    // Contained mode: raw value driven by wheel, touch drag and arrow keys.
    // Pinned mode: native page scroll through the track section.
    const rawProgress = useMotionValue(0);
    const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
    const smoothProgress = useSpring(pinned ? scrollYProgress : rawProgress, {
        stiffness: pinned ? 120 : 80,
        damping: 30,
        restDelta: 0.0001,
    });

    // Wheel + touch drive the tunnel, but hand control back to the page once the
    // tunnel hits either end or the hero is already partly scrolled out of view,
    // so the hero never traps visitors at the top of a longer page.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || pinned) return;

        const tryAdvance = (delta: number) => {
            const current = rawProgress.get();
            const atEnd = (delta > 0 && current >= 1) || (delta < 0 && current <= 0);
            const scrolledAway = el.getBoundingClientRect().top < -1;
            if (delta === 0 || atEnd || scrolledAway) return false;
            rawProgress.set(Math.min(1, Math.max(0, current + delta)));
            return true;
        };

        const handleWheel = (e: WheelEvent) => {
            // Adjust speed of tunnel travel here
            if (tryAdvance(e.deltaY * 0.0008)) e.preventDefault();
        };

        let lastY: number | null = null;
        const handleTouchStart = (e: TouchEvent) => {
            lastY = e.touches[0].clientY;
        };
        const handleTouchMove = (e: TouchEvent) => {
            if (lastY === null) return;
            const y = e.touches[0].clientY;
            if (tryAdvance((lastY - y) * 0.0025) && e.cancelable) e.preventDefault();
            lastY = y;
        };
        const handleTouchEnd = () => {
            lastY = null;
        };

        el.addEventListener("wheel", handleWheel, { passive: false });
        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd);
        return () => {
            el.removeEventListener("wheel", handleWheel);
            el.removeEventListener("touchstart", handleTouchStart);
            el.removeEventListener("touchmove", handleTouchMove);
            el.removeEventListener("touchend", handleTouchEnd);
        };
    }, [rawProgress, pinned]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (pinned) return; // native page scroll handles keys
        const step = { ArrowDown: 0.08, PageDown: 0.2, ArrowUp: -0.08, PageUp: -0.2 }[e.key];
        if (step === undefined) return;
        const current = rawProgress.get();
        if ((step > 0 && current >= 1) || (step < 0 && current <= 0)) return; // let the page scroll
        e.preventDefault();
        rawProgress.set(Math.min(1, Math.max(0, current + step)));
    };

    const pointer = useCameraParallax(!reduce);

    const titleScale = useTransform(smoothProgress, [0, 0.5, 1], [0.7, 1, 1.35]);
    const titleOpacity = useTransform(smoothProgress, [0, 0.12, 0.85, 1], [0.25, 1, 1, 0]);
    const promptOpacity = useTransform(smoothProgress, [0, 0.12], [1, 0]);

    return (
        <section
            ref={trackRef}
            className="relative"
            // Inline so the track length never depends on a generated Tailwind class
            style={pinned ? { height: `${scrollLength * 100}svh` } : undefined}
        >
        <div
            ref={containerRef}
            tabIndex={pinned ? undefined : 0}
            onKeyDown={handleKeyDown}
            aria-label="3D image tunnel. Scroll, swipe, or use the arrow keys to move through it."
            className={cn(
                "relative w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white select-none flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500",
                pinned && "sticky top-0",
                className
            )}
            style={{
                height: "100svh",
                perspective: stage.isMobile ? "900px" : "1200px",
                transformStyle: "preserve-3d",
            }}
        >
            {/* Immersive Background Grid & Glow */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)] opacity-70 dark:opacity-65" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.2)_0%,transparent_75%)]" />

            {/* Depth Ring Guides */}
            <div className="pointer-events-none absolute h-[48vmin] w-[48vmin] rounded-full border border-indigo-500/15 dark:border-indigo-400/10" />
            <div className="pointer-events-none absolute h-[76vmin] w-[76vmin] rounded-full border border-dashed border-neutral-300/60 dark:border-white/10" />

            {/* Central Anchor Typography */}
            <motion.div
                style={{ scale: titleScale, opacity: titleOpacity }}
                className="pointer-events-none z-0 flex flex-col items-center text-center px-6 max-w-xl"
            >
                <p className="text-xs font-mono uppercase tracking-[0.4em] text-indigo-600 dark:text-indigo-400 mb-4">
                    {eyebrow}
                </p>
                <Heading className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] bg-gradient-to-b from-neutral-950 via-neutral-800 to-neutral-400 dark:from-white dark:via-white dark:to-white/40 bg-clip-text text-transparent">
                    {title}
                </Heading>
                <p className="mt-4 max-w-[36ch] text-sm sm:text-base font-light text-neutral-600 dark:text-neutral-400">
                    {description}
                </p>
            </motion.div>

            {/* Scroll Prompt */}
            <motion.div
                style={{ opacity: promptOpacity }}
                className="pointer-events-none absolute bottom-8 z-20 flex flex-col items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400"
            >
                <span>{scrollPrompt}</span>
                <div className="h-6 w-px bg-gradient-to-b from-indigo-500 to-transparent" />
            </motion.div>

            {/* 3D Z-Space Plane */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ transformStyle: "preserve-3d" }}
            >
                {tunnelCards.map((card) => (
                    <TunnelCard
                        key={card.item.title}
                        card={card}
                        progress={smoothProgress}
                        pointer={pointer}
                        total={tunnelCards.length}
                        stage={stage}
                    />
                ))}
            </div>
        </div>
        </section>
    );
}
