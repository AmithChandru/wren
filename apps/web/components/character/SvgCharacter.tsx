"use client";
/**
 * SvgCharacter.tsx — the default (zero-asset) character renderer.
 *
 * Exposes an imperative handle implementing CharacterRenderer:
 *   ref.setViseme(n) | setExpression(e) | setTalking(b) | setGaze(x,y)
 * A requestAnimationFrame loop eases current values toward targets and paints the SVG.
 * Drive it with createSpeechDriver() from the shared character module.
 *
 * Renderer notes: the only
 * change is the import path (`@wren/shared/character`) and the handle type, which is the
 * shared `CharacterRenderer` interface.
 */
import { forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import {
  VISEMES,
  EXPRESSIONS,
  mouthPath,
  lerp,
  clamp,
  type Expression,
  type CharacterRenderer,
} from "@wren/shared/character";

export type CharacterHandle = CharacterRenderer;

export const SvgCharacter = forwardRef<CharacterHandle, { className?: string }>(
  function SvgCharacter({ className }, ref) {
    // ---- element refs ----
    const charG = useRef<SVGGElement>(null);
    const mouth = useRef<SVGPathElement>(null);
    const teeth = useRef<SVGEllipseElement>(null);
    const browL = useRef<SVGPathElement>(null);
    const browR = useRef<SVGPathElement>(null);
    const eyeL = useRef<SVGGElement>(null);
    const eyeR = useRef<SVGGElement>(null);
    const irisL = useRef<SVGCircleElement>(null);
    const irisR = useRef<SVGCircleElement>(null);
    const pupL = useRef<SVGCircleElement>(null);
    const pupR = useRef<SVGCircleElement>(null);
    const cheekL = useRef<SVGEllipseElement>(null);
    const cheekR = useRef<SVGEllipseElement>(null);

    // ---- targets (set via imperative handle) ----
    const visemeT = useRef(0);
    const exprT = useRef<Expression>("neutral");
    const talking = useRef(false);
    const gaze = useRef({ x: 0, y: 0 });

    // ---- current animated values ----
    const cur = useRef({
      open: 0.04,
      wide: 0.5,
      round: 0.3,
      smile: 0.25,
      cheek: 0.12,
      brow: 0,
      eye: 1,
      gx: 0,
      gy: 0,
      head: 0,
    });

    useImperativeHandle(ref, () => ({
      setViseme: (v) => {
        visemeT.current = v;
      },
      setExpression: (e) => {
        exprT.current = e;
      },
      setTalking: (t) => {
        talking.current = t;
      },
      setGaze: (x, y) => {
        gaze.current = { x, y };
      },
    }));

    useEffect(() => {
      let raf = 0;
      let blink = 1;
      let nextBlink = performance.now() + 1500;
      let dx = 0,
        dy = 0;
      let nextDart = performance.now() + 2000;

      const render = (now: number) => {
        // blink scheduling
        if (now > nextBlink) {
          blink = 0.08;
          if (now > nextBlink + 110) {
            blink = 1;
            nextBlink = now + 2200 + Math.random() * 3500;
          }
        } else if (blink < 1) blink = lerp(blink, 1, 0.5);

        // idle eye darts
        if (now > nextDart) {
          dx = (Math.random() * 2 - 1) * 3;
          dy = (Math.random() * 2 - 1) * 2;
          nextDart = now + 1800 + Math.random() * 2600;
        }

        const vt = VISEMES[clamp(visemeT.current, 0, VISEMES.length - 1)] ?? VISEMES[0]!;
        const ex = EXPRESSIONS[exprT.current];
        const k = 0.28;
        const m = talking.current ? 0.55 : 0.3;
        const c = cur.current;
        c.open = lerp(c.open, vt.open, m);
        c.wide = lerp(c.wide, vt.wide, m);
        c.round = lerp(c.round, vt.round, m);
        c.smile = lerp(c.smile, ex.smile, k);
        c.cheek = lerp(c.cheek, ex.cheek, k);
        c.brow = lerp(c.brow, ex.brow, k);
        c.eye = lerp(c.eye, ex.eye, k);
        c.gx = lerp(c.gx, ex.gx + gaze.current.x + dx, k);
        c.gy = lerp(c.gy, ex.gy + gaze.current.y + dy, k);
        c.head = lerp(c.head, ex.head, k);

        const bob = Math.sin(now / 1400) * 3.2;
        charG.current?.setAttribute(
          "transform",
          `translate(0 ${bob.toFixed(2)}) rotate(${c.head.toFixed(2)} 180 250)`,
        );
        mouth.current?.setAttribute("d", mouthPath(c.open, c.wide, c.round, c.smile));

        const th = clamp(c.open * 0.9, 0, 1);
        teeth.current?.setAttribute("rx", (24 * (0.6 + 0.4 * c.wide) * th).toFixed(1));
        teeth.current?.setAttribute("ry", (3.5 * th).toFixed(1));
        teeth.current?.setAttribute("cy", (232 - 12 * c.open).toFixed(1));
        teeth.current?.setAttribute("opacity", (th * 0.85).toFixed(2));

        const s = (c.eye * blink).toFixed(3);
        eyeL.current?.setAttribute(
          "transform",
          `translate(142 168) scale(1 ${s}) translate(-142 -168)`,
        );
        eyeR.current?.setAttribute(
          "transform",
          `translate(218 168) scale(1 ${s}) translate(-218 -168)`,
        );

        irisL.current?.setAttribute("cx", String(142 + c.gx));
        irisL.current?.setAttribute("cy", String(170 + c.gy));
        pupL.current?.setAttribute("cx", String(142 + c.gx));
        pupL.current?.setAttribute("cy", String(170 + c.gy));
        irisR.current?.setAttribute("cx", String(218 + c.gx));
        irisR.current?.setAttribute("cy", String(170 + c.gy));
        pupR.current?.setAttribute("cx", String(218 + c.gx));
        pupR.current?.setAttribute("cy", String(170 + c.gy));

        browL.current?.setAttribute("transform", `translate(0 ${c.brow}) rotate(${ex.tilt} 142 130)`);
        browR.current?.setAttribute(
          "transform",
          `translate(0 ${c.brow}) rotate(${-ex.tilt} 218 130)`,
        );

        cheekL.current?.setAttribute("opacity", c.cheek.toFixed(2));
        cheekR.current?.setAttribute("opacity", c.cheek.toFixed(2));

        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);
      return () => cancelAnimationFrame(raf);
    }, []);

    return (
      <svg className={className} viewBox="0 0 360 360" style={{ overflow: "visible" }} aria-hidden>
        <defs>
          <radialGradient id="halo" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#FFE9CF" />
            <stop offset="100%" stopColor="#FFE9CF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="skinG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8D4B6" />
            <stop offset="100%" stopColor="#EEBE99" />
          </linearGradient>
          <linearGradient id="hairG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6E472F" />
            <stop offset="100%" stopColor="#4E3020" />
          </linearGradient>
        </defs>

        <circle cx="180" cy="170" r="150" fill="url(#halo)" />

        <g ref={charG}>
          <path d="M86 360 Q98 286 180 286 Q262 286 274 360 Z" fill="#2A8C84" />
          <path d="M150 292 Q180 310 210 292 L210 360 L150 360 Z" fill="#FFF8EF" opacity=".9" />
          <path
            d="M70 196 Q60 70 180 64 Q300 70 290 196 Q300 250 268 262 L92 262 Q60 250 70 196 Z"
            fill="url(#hairG)"
          />
          <path
            d="M84 188 Q84 92 180 92 Q276 92 276 188 Q276 268 180 272 Q84 268 84 188 Z"
            fill="url(#skinG)"
          />
          <ellipse cx="86" cy="196" rx="13" ry="18" fill="url(#skinG)" />
          <ellipse cx="274" cy="196" rx="13" ry="18" fill="url(#skinG)" />
          <path
            d="M82 150 Q92 96 180 92 Q268 96 278 150 Q250 120 180 122 Q140 122 118 138 Q98 150 82 150 Z"
            fill="url(#hairG)"
          />

          <ellipse ref={cheekL} cx="128" cy="206" rx="20" ry="13" fill="#EE9E8C" opacity="0" />
          <ellipse ref={cheekR} cx="232" cy="206" rx="20" ry="13" fill="#EE9E8C" opacity="0" />

          <path
            ref={browL}
            d="M118 134 Q142 124 166 132"
            stroke="#5A3825"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            ref={browR}
            d="M194 132 Q218 124 242 134"
            stroke="#5A3825"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />

          <g ref={eyeL}>
            <ellipse cx="142" cy="168" rx="22" ry="25" fill="#fff" />
            <circle ref={irisL} cx="142" cy="170" r="12.5" fill="#5A3825" />
            <circle ref={pupL} cx="142" cy="170" r="6.5" fill="#241712" />
            <circle cx="137" cy="165" r="3.2" fill="#fff" />
          </g>
          <g ref={eyeR}>
            <ellipse cx="218" cy="168" rx="22" ry="25" fill="#fff" />
            <circle ref={irisR} cx="218" cy="170" r="12.5" fill="#5A3825" />
            <circle ref={pupR} cx="218" cy="170" r="6.5" fill="#241712" />
            <circle cx="213" cy="165" r="3.2" fill="#fff" />
          </g>

          <path
            d="M178 196 Q172 210 180 214 Q188 210 182 196"
            fill="none"
            stroke="#E0A87F"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          <path
            ref={mouth}
            d=""
            fill="#7A3B33"
            stroke="#C76A5C"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <ellipse ref={teeth} cx="180" cy="232" rx="0" ry="0" fill="#fff" opacity="0" />
        </g>
      </svg>
    );
  },
);
