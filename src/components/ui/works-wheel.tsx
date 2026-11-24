"use client";

// A portfolio index built as a wheel you turn.
//
// At rest the work sits in a ring around a title, each card tangent to the
// circle. The first notch of scroll blows the ring open into a vertical drum:
// the card at the front lies flat and full size, the ones above and below
// rotate away into hard perspective and run off the top and bottom of the
// frame. Keep turning and the drum carries the next piece round to the front.
//
// The whole thing is one number - `turn` - read by a single rAF pass that writes
// transforms straight to the DOM. 0 is the ring, 1 is the drum with item 0 at
// the front, and every whole number after that is one more item turned past.
//
// Two ways to drive it:
// - Contained (default): wheel, drag and arrow keys turn it in place.
// - Pinned (`scrollLength`): the frame sticks to the viewport while the page
//   scrolls through a tall track, and page scroll position turns the wheel.
//   Nothing is hijacked, so touch, keyboard and the scrollbar all just work.
import * as React from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface WorksWheelItem {
  /** Project name. Shown beside the front card and in the index. */
  title: string;
  /** Cover art. Any src an <img> takes. */
  image: string;
  /** Where the card links to. Omit for a wheel that only browses. */
  href?: string;
  /** Suite label, e.g. "Suite 01" */
  suite?: string;
  /** Tag label, e.g. "Port 9000 Ready" or "±₹2.00 Tol" */
  badge?: string;
  /** Tone for glowing shadow */
  tone?: "emerald" | "rose" | "indigo" | "blue" | "violet" | "amber" | "slate";
  /** Description or subtitle */
  subtitle?: string;
  /** Sub-modules for quick jump pills */
  items?: { label: string; badge?: string; route?: string; tone?: string }[];
}

const TONE_COLORS: Record<string, { glow: string; dot: string; ambient: string }> = {
  emerald: {
    glow: "rgba(16, 185, 129, 0.55)",
    dot: "#10b981",
    ambient: "rgba(16, 185, 129, 0.18)",
  },
  rose: {
    glow: "rgba(244, 63, 94, 0.55)",
    dot: "#f43f5e",
    ambient: "rgba(244, 63, 94, 0.17)",
  },
  indigo: {
    glow: "rgba(99, 102, 241, 0.55)",
    dot: "#6366f1",
    ambient: "rgba(99, 102, 241, 0.20)",
  },
  amber: {
    glow: "rgba(245, 158, 11, 0.55)",
    dot: "#f59e0b",
    ambient: "rgba(245, 158, 11, 0.18)",
  },
  blue: {
    glow: "rgba(59, 130, 246, 0.55)",
    dot: "#3b82f6",
    ambient: "rgba(59, 130, 246, 0.18)",
  },
  violet: {
    glow: "rgba(139, 92, 246, 0.55)",
    dot: "#8b5cf6",
    ambient: "rgba(139, 92, 246, 0.18)",
  },
  slate: {
    glow: "rgba(100, 116, 139, 0.40)",
    dot: "#64748b",
    ambient: "rgba(100, 116, 139, 0.14)",
  },
};

export interface WorksWheelProps extends Omit<
  React.ComponentPropsWithoutRef<"section">,
  "children"
> {
  items: WorksWheelItem[];
  /** Sits in the middle of the ring. @default "Works '26" */
  label?: string;
  /** Label on the card's hover affordance. Omit to drop it. @default "View" */
  action?: string;
  /** Called when a card is clicked (or Enter is pressed on the front card).
      Without it, clicking a card turns it to the front. */
  onItemClick?: (item: WorksWheelItem, index: number) => void;
  /** Called when a quick-jump sub-module chip is clicked on the left side. */
  onSubModuleClick?: (route: string) => void;
  /**
   * Explanation panel for the front card. When given, the wheel moves to the
   * left (top on narrow screens) and this panel sits beside it, fading in as
   * the ring opens and swapping as each card turns to the front. It replaces
   * the large front title and the index list.
   */
  renderDetail?: (
    item: WorksWheelItem,
    index: number,
    nav: { goTo: (index: number) => void; count: number },
  ) => React.ReactNode;
  /**
   * Pinned mode: track height in screens. The frame stays stuck while the page
   * scrolls this far, and the scroll turns the wheel. Set the CSS variable
   * `--works-wheel-top` (e.g. to a sticky header's height) to pin below it.
   */
  scrollLength?: number;
}

/* Geometry. The card is measured against the stage; everything else is measured
   against the card, so a narrow stage - where the card is capped by width, not
   height - scales the whole wheel down with it instead of leaving a small card
   swinging on a huge drum. The three that matter are tuned together: STEP
   against DRUM sets how hard the neighbours rotate away, and DRUM against LENS
   decides whether they land inside the frame or run off it. */
const CARD_H = 0.35; // front card height, of the stage (compact size)
const CARD_MAX_W = 0.40; // ... but never wider than this much of the stage
const CARD_RATIO = 1.45; // card width / height
const STEP = 40; // degrees between cards on the drum
const DRUM = 2.22; // drum radius, in card heights - and everything below likewise
const LENS = 2.7; // perspective distance
const RING_R = 1.14; // ring radius
/* The drum alone hangs the work on a plumb line. It isn't one: the strip curves
   away round an arc whose centre sits off to the LEFT, so the piece at the front
   is at the arc's near point - dead centre - and its neighbours have already
   swung back left as well as up and down. BOW is that arc's radius; nothing else
   makes the difference between a stack of cards and a wheel seen side on. */
const BOW = 1.82;
const TITLE = 0.095; // ring label and front-card title
const INDEX = 0.045; // the index down the right-hand side
/** Items either side of the front still worth drawing. Past this a card is
    edge-on, and further round it would stack up on the vanishing point. */
const CULL = 1.6;

/** How much of a wheel-notch or a dragged pixel counts as one item. */
const WHEEL_UNITS = 900;
const DRAG_UNITS = 420;
/** Quiet time after the last wheel/scroll event before the wheel settles on an item. */
const SETTLE = 140;
/** Fraction of the remaining distance closed each frame. 1 = no smoothing. */
const EASE = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Stage = { w: number; h: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** How far left the arc has carried something that has turned `drumDeg` off the
    front. Zero at the front, so the piece being read stays centred. */
const bowAt = (drumDeg: number, bow: number) =>
  -bow * (1 - Math.cos(rad(drumDeg)));

/** Both states in one chain: the ring terms fall away as `m` reaches the drum,
    and the drum terms are still zero while the ring is up. The bow is applied
    first, in the wheel's own plane, so it slides the card sideways rather than
    turning with it - and perspective still shrinks it with distance. */
function place(
  ringDeg: number,
  drumDeg: number,
  ringR: number,
  drumR: number,
  bow: number,
  m: number,
) {
  return (
    `translateX(${m * bowAt(drumDeg, bow)}px)` +
    ` rotateZ(${(1 - m) * ringDeg}deg) translateY(${-(1 - m) * ringR}px)` +
    ` rotateX(${m * drumDeg}deg) translateZ(${m * drumR}px)`
  );
}

export interface WorksWheelHandle {
  /** Turn item `index` to the front (scrolls the page in pinned mode). */
  goTo: (index: number) => void;
}

export const WorksWheel = React.forwardRef<WorksWheelHandle, WorksWheelProps>(function WorksWheel({
  items,
  label = "Works '26",
  action = "View",
  onItemClick,
  onSubModuleClick,
  renderDetail,
  scrollLength,
  className,
  style,
  ...props
}, ref) {
  const pinned = scrollLength !== undefined && scrollLength > 1;
  const hasDetail = Boolean(renderDetail);
  const trackRef = React.useRef<HTMLElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<(HTMLElement | null)[]>([]);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const watermarkRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLDivElement>(null);

  // The wheel's position, and where it is heading. Only `active` is state -
  // everything else is written to the DOM, so turning the wheel is not a render.
  // Start at turn = 1 so the wheel opens immediately with Card 1 front-and-center.
  const turn = React.useRef(1);
  const target = React.useRef(1);
  const [active, setActive] = React.useState(0);
  const [stage, setStage] = React.useState<Stage>({ w: 0, h: 0 });
  const drag = React.useRef<number | null>(null);
  const dragStart = React.useRef(0);
  const dragCaptured = React.useRef(false);
  const settling = React.useRef(0);

  const count = items.length;
  const last = Math.max(count - 1, 0);

  // Read after mount, not during render: the server has no matchMedia, and
  // branching on it inline is a hydration mismatch. Reduced motion drops the
  // easing, so the wheel lands where it is put instead of gliding there.
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // With a detail panel the wheel shares the frame: left half on wide screens,
  // top band on narrow ones (where the panel takes the lower part).
  const narrow = stage.w > 0 && stage.w < 768;
  const wheelX = hasDetail && !narrow ? "28%" : "53%";
  const wheelY = hasDetail && narrow ? "27%" : "52%";

  const metrics = React.useMemo(() => {
    const w = stage.w || (typeof window !== "undefined" ? window.innerWidth : 1200);
    const h = stage.h || (typeof window !== "undefined" ? Math.max(480, window.innerHeight - 200) : 600);
    const cardW = hasDetail
      ? narrow
        ? Math.min(h * 0.24 * CARD_RATIO, w * 0.72)
        : Math.min(h * CARD_H * CARD_RATIO, w * 0.36)
      : Math.min(h * CARD_H * CARD_RATIO, w * CARD_MAX_W);
    const cardH = cardW / CARD_RATIO;
    const drumR = cardH * DRUM;
    const ringR = cardH * RING_R;
    // Shrink the ring's cards until the circle reads as a closed loop rather
    // than beads on a wire, however many pieces the wheel is given.
    const ringScale = count
      ? clamp((((2 * Math.PI * ringR) / count) * 0.82) / (cardW || 1), 0.16, 1)
      : 1;
    return {
      cardW,
      cardH,
      ringR,
      ringScale,
      drumR,
      bow: cardH * BOW,
      depth: Math.max(cardH * LENS, 900),
      title: Math.max(cardH * TITLE, 24),
      index: Math.max(cardH * INDEX, 13),
    };
  }, [stage, count, hasDetail, narrow]);

  // One pass per frame: ease toward the target, then write every transform.
  React.useEffect(() => {
    if (!stage.h) return;
    let frame = 0;
    const { ringR, ringScale, drumR, bow } = metrics;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const gap = target.current - turn.current;
      if (Math.abs(gap) < 0.0005) turn.current = target.current;
      else turn.current += gap * (reduced ? 1 : EASE);

      const t = turn.current;
      const m = clamp(t, 0, 1);
      const pos = Math.max(0, t - 1);

      // The drum is pulled back so its front face lands on the picture plane.
      // That set-back has to arrive with the drum, or the ring would sit at the
      // far side of the perspective and render at half its size.
      if (wheelRef.current) {
        wheelRef.current.style.transform = `translateZ(${-m * drumR}px)`;
      }

      for (let i = 0; i < count; i++) {
        const d = i - pos;
        const drumDeg = d * STEP;
        const card = cardRefs.current[i];
        if (card) {
          card.style.transform = place(
            d * (360 / count),
            drumDeg,
            ringR,
            drumR,
            bow,
            m,
          );
          // Distance fade: front card (dist=0) is 1.0; distant tilted cards smoothly dissolve
          const dist = Math.abs(d);
          const fade = m > 0.5 ? clamp(1 - dist * 0.55, 0, 1) : 1;
          card.style.opacity = String(fade);
          card.style.zIndex = String(Math.round(100 - dist * 2));
        }
        const face = card?.firstElementChild as HTMLElement | null;
        if (face) face.style.transform = `scale(${lerp(ringScale, 1, m)})`;
      }

      if (watermarkRef.current) watermarkRef.current.style.opacity = String(1 - m);
      if (labelRef.current) {
        labelRef.current.style.opacity = String(1 - m);
        labelRef.current.style.pointerEvents = m < 0.4 ? "auto" : "none";
      }
      if (titleRef.current) {
        titleRef.current.style.opacity = String(m);
        // The panel holds buttons; clickable once it is showing.
        titleRef.current.style.pointerEvents = m > 0.6 ? "auto" : "none";
      }
      const near = clamp(Math.round(pos), 0, last);
      setActive((prev) => (prev === near ? prev : near));
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [metrics, stage.h, count, last, reduced, hasDetail]);

  const to = React.useCallback(
    (next: number) => {
      target.current = clamp(next, 0, last + 1);
    },
    [last],
  );

  // Pinned mode geometry: where the track is, and how far the page scrolls
  // while the frame is stuck.
  const trackSpan = React.useCallback(() => {
    const track = trackRef.current;
    const frame = frameRef.current;
    if (!track || !frame) return null;
    const top = parseFloat(getComputedStyle(frame).top) || 0;
    const rect = track.getBoundingClientRect();
    return { top, rect, span: Math.max(1, rect.height - frame.offsetHeight) };
  }, []);

  // Pinned: page scroll position is the wheel position.
  React.useEffect(() => {
    if (!pinned) return;
    const onScroll = () => {
      const g = trackSpan();
      if (!g) return;
      const p = clamp((g.top - g.rect.top) / g.span, 0, 1);
      to(p * (last + 1));
      // Scrolling stops wherever it stops; land on an item rather than between
      // two, once the drum is open.
      window.clearTimeout(settling.current);
      settling.current = window.setTimeout(() => {
        if (target.current > 1) to(Math.round(target.current));
      }, SETTLE);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(settling.current);
    };
  }, [pinned, trackSpan, to, last]);

  /** Bring wheel position `n` to the front - by scrolling the page when pinned. */
  const goTo = React.useCallback(
    (n: number) => {
      if (!pinned) {
        to(n);
        return;
      }
      const g = trackSpan();
      if (!g) return;
      const absTop = g.rect.top + window.scrollY;
      const p = clamp(n, 0, last + 1) / (last + 1);
      window.scrollTo({
        top: absTop - g.top + p * g.span,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [pinned, trackSpan, to, last, reduced],
  );

  React.useImperativeHandle(ref, () => ({ goTo: (index: number) => goTo(index + 1) }), [goTo]);

  // Contained: native listener, because the wheel has to be cancellable - and
  // it only cancels while it still has somewhere to go, so the page scrolls on
  // at either end instead of trapping the reader.
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el || pinned) return;
    const onWheel = (event: WheelEvent) => {
      const next = target.current + event.deltaY / WHEEL_UNITS;
      if (next > 0 && next < last + 1) event.preventDefault();
      to(next);
      // A wheel gesture arrives as a burst of events with no end of its own, so
      // the rest position is whatever notch it happened to stop on. Settle onto
      // an item.
      window.clearTimeout(settling.current);
      settling.current = window.setTimeout(
        () => to(Math.round(target.current)),
        SETTLE,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settling.current);
    };
  }, [to, last, pinned]);

  const activeItem = items[active];
  const activeToneKey = activeItem?.tone || "indigo";
  const activeToneConfig = TONE_COLORS[activeToneKey] || TONE_COLORS.indigo;

  const body = (
    <>
      {/* 🌐 1. Subtle Financial Blueprint Grid (Micro-dots + fine ledger lines with 3% Opacity) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_92%)]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            radial-gradient(circle, rgba(100, 116, 139, 0.22) 1px, transparent 1px)
          `,
          backgroundSize: "36px 36px, 36px 36px, 18px 18px",
        }}
        aria-hidden="true"
      />

      {/* 🔮 2. Breathing Ambient Mesh Light (Gently adapts to active suite tone) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Core dynamic ambient bloom centered behind the wheel */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] h-[540px] rounded-full blur-[140px] transition-colors duration-1000 ease-in-out animate-pulse"
          style={{
            backgroundColor: activeToneConfig.ambient,
            animationDuration: "5s",
          }}
        />
        {/* Secondary ambient mesh light off-center for depth */}
        <div
          className="absolute top-[8%] right-[15%] w-[420px] h-[360px] rounded-full blur-[120px] opacity-70 transition-colors duration-1000 ease-in-out"
          style={{
            backgroundColor: activeToneConfig.ambient,
          }}
        />
      </div>

      <div
        ref={stageRef}
        tabIndex={0}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`works-wheel-${active}`}
        className={cn(
          "focus-visible:outline-foreground absolute inset-0 z-10 outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 [mask-image:linear-gradient(to_bottom,transparent_0%,black_14%,black_86%,transparent_100%)]",
          !pinned && "cursor-grab touch-pan-x active:cursor-grabbing",
        )}
        style={{ perspective: `${metrics.depth}px` }}
        onPointerDown={
          pinned
            ? undefined
            : (event) => {
                // Capture only once the pointer really drags, so a plain click
                // still reaches the card underneath.
                drag.current = event.clientY;
                dragStart.current = event.clientY;
                dragCaptured.current = false;
              }
        }
        onPointerMove={
          pinned
            ? undefined
            : (event) => {
                if (drag.current === null) return;
                if (!dragCaptured.current) {
                  if (Math.abs(event.clientY - dragStart.current) < 4) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragCaptured.current = true;
                }
                to(target.current + (drag.current - event.clientY) / DRAG_UNITS);
                drag.current = event.clientY;
              }
        }
        onPointerUp={
          pinned
            ? undefined
            : () => {
                // Land on an item rather than between two.
                drag.current = null;
                if (target.current > 1) to(Math.round(target.current));
              }
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") goTo(Math.round(target.current) + 1);
          else if (event.key === "ArrowUp") goTo(Math.round(target.current) - 1);
          else if (event.key === "Enter" && onItemClick && target.current >= 1)
            onItemClick(items[active], active);
          else return;
          event.preventDefault();
        }}
      >
        <div
          ref={wheelRef}
          className="absolute [transform-style:preserve-3d]"
          style={{ left: wheelX, top: wheelY }}
        >
          {items.map((item, i) => {
            const Tag = (item.href ? "a" : "div") as "a";
            const clickable = Boolean(item.href || onItemClick);
            const toneKey = item.tone || "indigo";
            const toneConfig = TONE_COLORS[toneKey] || TONE_COLORS.indigo;
            return (
              <Tag
                key={item.title}
                id={`works-wheel-${i}`}
                role="option"
                aria-selected={i === active}
                href={item.href}
                onClick={() => (onItemClick && i === active ? onItemClick(item, i) : goTo(i + 1))}
                ref={(node: HTMLElement | null) => {
                  cardRefs.current[i] = node;
                }}
                className="group absolute cursor-pointer [backface-visibility:hidden]"
                style={{
                  width: metrics.cardW,
                  height: metrics.cardH,
                  marginLeft: -metrics.cardW / 2,
                  marginTop: -metrics.cardH / 2,
                }}
              >
                <span className="relative block size-full [transform-style:preserve-3d]">
                  {/* 1. Dynamic Colored Ambient Glow behind the card */}
                  <span
                    className="absolute -inset-4 rounded-3xl blur-2xl transition-all duration-300 pointer-events-none"
                    style={{
                      backgroundColor: toneConfig.glow,
                      opacity: i === active ? 0.85 : 0.2,
                    }}
                    aria-hidden="true"
                  />

                  {/* 2. Main Card Body with rounded-2xl & crisp glass outline */}
                  <span className="relative block size-full overflow-hidden rounded-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-[1.02]">
                    <img
                      src={item.image}
                      alt={item.title}
                      draggable={false}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />

                    {/* 3. Subtle Bottom Gradient Scrim & Vignette */}
                    <span
                      className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none"
                      aria-hidden="true"
                    />

                    {/* 4. Floating Frosted Glass Tag (Top-Left) */}
                    <span className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] font-mono font-medium text-white shadow-lg backdrop-blur-md border border-white/20 pointer-events-none">
                      <span
                        className="size-2 rounded-full animate-pulse shrink-0 shadow-[0_0_8px_currentColor]"
                        style={{ backgroundColor: toneConfig.dot, color: toneConfig.dot }}
                      />
                      <span className="tracking-wide">{item.suite || `Suite 0${i + 1}`}</span>
                      {item.badge ? (
                        <>
                          <span className="opacity-40">•</span>
                          <span className="text-white/90 font-sans text-[9px] font-normal tracking-normal">{item.badge}</span>
                        </>
                      ) : null}
                    </span>

                    {/* 5. Bottom Card Title & Action Affordance */}
                    <span className="absolute bottom-3 left-3.5 right-3.5 z-20 flex items-center justify-between text-white pointer-events-none">
                      <span className="text-xs sm:text-sm font-bold tracking-tight text-white drop-shadow-md truncate max-w-[70%]">
                        {item.title}
                      </span>
                      {action && clickable ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md border border-white/25 shadow-xs transition group-hover:bg-white/30">
                          <span>{action}</span>
                          <ArrowUpRight className="size-2.5" />
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>
              </Tag>
            );
          })}
        </div>
      </div>

      {/* Pristine Brand Watermark Logo at the center of the ring (fades out in drum mode) */}
      <div
        ref={watermarkRef}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center select-none z-10"
        style={{ left: wheelX, top: wheelY }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center -z-10 pointer-events-none">
          <div className="absolute w-[280px] h-[200px] rounded-full bg-emerald-500/20 dark:bg-emerald-400/25 blur-2xl animate-pulse" />
          <img
            src="/logo.png"
            alt="Brand Watermark Logo"
            className="w-[210px] sm:w-[240px] md:w-[260px] max-w-none h-auto object-contain opacity-35 dark:opacity-45 filter drop-shadow-[0_10px_28px_rgba(16,185,129,0.3)] select-none transition-all duration-300 pointer-events-none"
            draggable={false}
          />
        </div>
      </div>
      {renderDetail ? (
        <div
          ref={titleRef}
          className={cn(
            "pointer-events-none absolute opacity-0",
            narrow
              ? "inset-x-4 bottom-4 top-[52%] overflow-y-auto"
              : "top-1/2 right-[4%] left-[52%] max-h-[92%] -translate-y-1/2 overflow-y-auto",
          )}
        >
          {/* Keyed on the front card so each swap replays the entrance. */}
          <div
            key={active}
            className="animate-in fade-in-0 slide-in-from-bottom-3 duration-500 motion-reduce:animate-none"
          >
            {items[active]
              ? renderDetail(items[active], active, {
                  goTo: (i: number) => goTo(i + 1),
                  count,
                })
              : null}
          </div>
        </div>
      ) : (
        <>
          {/* 8 Suites Ring Overview Panel on the Left Side */}
          <div
            ref={labelRef}
            className="absolute top-1/2 left-[4%] -translate-y-1/2 max-w-[26rem] z-20 select-none transition-opacity duration-300 pointer-events-auto"
          >
            {/* 1. Overview Pill */}
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Practice Overview
              </span>
            </div>

            {/* 2. Title ("8 suites") */}
            <h2 className="font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight drop-shadow-xs text-2xl sm:text-3xl lg:text-4xl">
              {label}
            </h2>

            {/* 3. Description */}
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-normal max-w-[22rem]">
              Unified compliance &amp; audit autopilot. Select any suite to launch GST 2B reconciliation, 12M return filings, statutory audit working papers, or Tally integration.
            </p>

            {/* 4. Action CTA */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(1)}
                className="group/cta inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-2xs hover:shadow-xs transition-all duration-200 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Launch Suite 01</span>
                <ArrowRight className="size-3.5 text-slate-400 group-hover/cta:text-indigo-600 dark:group-hover/cta:text-indigo-400 transition-transform group-hover/cta:translate-x-0.5" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                or click any card
              </span>
            </div>
          </div>

          {/* Active Suite Detail Panel on the Left Side */}
          <div
            ref={titleRef}
            className="absolute top-1/2 left-[4%] -translate-y-1/2 max-w-[26rem] z-20 opacity-0 select-none transition-opacity duration-300"
          >
          {/* 1. Suite Pill */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-2xs"
              style={{
                backgroundColor: `${activeToneConfig.dot}14`,
                color: activeToneConfig.dot,
                borderColor: `${activeToneConfig.dot}30`,
              }}
            >
              <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: activeToneConfig.dot }} />
              {items[active]?.suite || `Suite 0${active + 1}`}
            </span>
          </div>

          {/* 2. Suite Title */}
          <h2 className="font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight drop-shadow-xs text-xl sm:text-2xl lg:text-3xl">
            {items[active]?.title}
          </h2>

          {/* 3. Suite Description (1-liner explanation) */}
          {items[active]?.subtitle ? (
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-normal max-w-[22rem]">
              {items[active]?.subtitle}
            </p>
          ) : null}

          {/* 4. Direct Sub-Module Quick Jump Chips (2-Column Grid Layout) */}
          {items[active]?.items && items[active]?.items?.length ? (
            <div className="mt-3.5 grid grid-cols-2 gap-2 max-w-[24rem]">
              {items[active]?.items?.map((sub) => (
                <button
                  key={sub.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sub.route) onSubModuleClick?.(sub.route);
                  }}
                  className="group/chip flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-2xs hover:shadow-xs transition-all duration-200 text-left cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 group-hover/chip:text-indigo-600 dark:group-hover/chip:text-indigo-400 truncate transition-colors">
                      {sub.label}
                    </span>
                    {sub.badge ? (
                      <span
                        className="text-[9px] font-mono font-medium truncate mt-0.5"
                        style={{ color: activeToneConfig.dot }}
                      >
                        {sub.badge}
                      </span>
                    ) : null}
                  </div>
                  <ArrowUpRight className="size-3 text-slate-400 group-hover/chip:text-slate-700 dark:group-hover/chip:text-slate-200 shrink-0 transition-transform group-hover/chip:translate-x-0.5 group-hover/chip:-translate-y-0.5" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        </>
      )}

      {!renderDetail && (
      <ol
        className="absolute top-1/2 -translate-y-1/2 right-4 sm:right-6 text-right z-30 flex flex-col gap-1 pointer-events-auto"
      >
        {items.map((item, i) => {
          const isActive = i === active;
          const toneKey = item.tone || "indigo";
          const toneConfig = TONE_COLORS[toneKey] || TONE_COLORS.indigo;
          const numStr = String(i + 1).padStart(2, "0");

          return (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => goTo(i + 1)}
                className={cn(
                  "group relative flex items-center justify-end gap-2.5 px-3 py-1.5 rounded-xl text-xs sm:text-[13px] transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                  isActive
                    ? "text-slate-900 dark:text-white font-semibold bg-white/75 dark:bg-slate-900/75 backdrop-blur-md shadow-xs border border-slate-200/70 dark:border-slate-800/70 translate-x-[-3px]"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 hover:backdrop-blur-xs hover:translate-x-[-2px] font-medium"
                )}
              >
                {/* Suite Number prefix */}
                <span
                  className={cn(
                    "font-mono text-[11px] transition-colors",
                    isActive
                      ? "text-slate-700 dark:text-slate-300 font-bold"
                      : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600"
                  )}
                >
                  {numStr}
                </span>

                <span className="text-slate-300 dark:text-slate-600 font-light select-none">·</span>

                {/* Suite Title */}
                <span className="tracking-tight whitespace-nowrap">{item.title}</span>

                {/* Active Accent Pip / Line */}
                <span
                  className={cn(
                    "h-3.5 rounded-full transition-all duration-300 shrink-0",
                    isActive
                      ? "w-1.5 opacity-100 scale-100"
                      : "w-1 opacity-0 scale-50 group-hover:opacity-40"
                  )}
                  style={{
                    backgroundColor: toneConfig.dot,
                    boxShadow: isActive ? `0 0 10px ${toneConfig.dot}` : undefined,
                  }}
                />
              </button>
            </li>
          );
        })}
      </ol>
      )}
    </>
  );

  if (pinned) {
    return (
      <section
        ref={trackRef}
        aria-label={label}
        className={cn("bg-background text-foreground relative w-full", className)}
        // Inline so the track length never depends on a generated Tailwind class
        style={{ ...style, height: `${scrollLength * 100}svh` }}
        {...props}
      >
        <div
          ref={frameRef}
          className="sticky w-full overflow-hidden select-none"
          style={{
            top: "var(--works-wheel-top, 0px)",
            height: "calc(100svh - var(--works-wheel-top, 0px))",
          }}
        >
          {body}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={label}
      className={cn(
        "bg-[#fafbfc] dark:bg-[#090d16] text-foreground relative h-full min-h-[24rem] w-full overflow-hidden select-none transition-colors duration-700",
        className,
      )}
      style={style}
      {...props}
    >
      {body}
    </section>
  );
});

export default WorksWheel;
