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
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface WorksWheelItem {
  /** Project name. Shown beside the front card and in the index. */
  title: string;
  /** Cover art. Any src an <img> takes. */
  image: string;
  /** Where the card links to. Omit for a wheel that only browses. */
  href?: string;
}

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
const CARD_H = 0.46; // front card height, of the stage
const CARD_MAX_W = 0.52; // ... but never wider than this much of the stage
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
const TITLE = 0.085; // ring label and front-card title
const INDEX = 0.04; // the index down the right-hand side
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
  const titleRef = React.useRef<HTMLDivElement>(null);

  // The wheel's position, and where it is heading. Only `active` is state -
  // everything else is written to the DOM, so turning the wheel is not a render.
  const turn = React.useRef(0);
  const target = React.useRef(0);
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
  const wheelX = hasDetail && !narrow ? "28%" : "50%";
  const wheelY = hasDetail && narrow ? "27%" : "50%";

  const metrics = React.useMemo(() => {
    const { w, h } = stage;
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
      depth: cardH * LENS,
      title: cardH * TITLE,
      index: cardH * INDEX,
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
          // Culled by distance, not by angle: at a full turn the far side comes
          // back round to face us, and everything past the neighbours lands on
          // the vanishing point in a heap.
          card.style.opacity = m > 0.5 && Math.abs(d) > CULL ? "0" : "1";
          card.style.zIndex = String(Math.round(100 - Math.abs(d) * 2));
        }
        const face = card?.firstElementChild as HTMLElement | null;
        if (face) face.style.transform = `scale(${lerp(ringScale, 1, m)})`;
      }

      if (labelRef.current) labelRef.current.style.opacity = String(1 - m);
      if (titleRef.current) {
        titleRef.current.style.opacity = String(m);
        // The detail panel holds buttons; only clickable once it is showing.
        titleRef.current.style.pointerEvents = hasDetail && m > 0.6 ? "auto" : "none";
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

  const body = (
    <>
      <div
        ref={stageRef}
        tabIndex={0}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`works-wheel-${active}`}
        className={cn(
          "focus-visible:outline-foreground absolute inset-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-4",
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
            return (
              <Tag
                key={item.title}
                id={`works-wheel-${i}`}
                role="option"
                aria-selected={i === active}
                href={item.href}
                onClick={() => (onItemClick ? onItemClick(item, i) : goTo(i + 1))}
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
                <span className="bg-muted shadow-foreground/12 relative block size-full overflow-hidden rounded-lg shadow-[0_18px_40px_-18px_var(--tw-shadow-color)]">
                  <img
                    src={item.image}
                    alt={item.title}
                    draggable={false}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                  {action && clickable ? (
                    <span className="bg-background/80 text-foreground pointer-events-none absolute right-3 bottom-3 flex translate-y-1 items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] opacity-0 backdrop-blur-sm transition group-hover:translate-y-0 group-hover:opacity-100">
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                      {action}
                    </span>
                  ) : null}
                </span>
              </Tag>
            );
          })}
        </div>
      </div>

      {/* Ring title and front-card title trade places across the transition.
          Type is sized off the measured stage, not vh, so the wheel keeps its
          proportions inside a card as well as at full bleed. */}
      <div
        ref={labelRef}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 tracking-tight whitespace-nowrap"
        style={{ fontSize: metrics.title, left: wheelX, top: wheelY }}
      >
        {label}
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
        <div
          ref={titleRef}
          className="pointer-events-none absolute top-1/2 left-[8%] -translate-y-1/2 tracking-tight opacity-0"
          style={{ fontSize: metrics.title }}
        >
          {items[active]?.title}
        </div>
      )}

      {!renderDetail && (
      <ol
        className="text-muted-foreground absolute top-[7.5%] right-[2.5%] text-right leading-[1.75]"
        style={{ fontSize: metrics.index }}
      >
        {items.map((item, i) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => (onItemClick ? onItemClick(item, i) : goTo(i + 1))}
              className={cn(
                "focus-visible:outline-foreground cursor-pointer transition-colors outline-none focus-visible:outline-1",
                i === active && "text-foreground font-medium",
              )}
            >
              {item.title}
            </button>
          </li>
        ))}
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
        "bg-background text-foreground relative h-full min-h-[24rem] w-full overflow-hidden select-none",
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
