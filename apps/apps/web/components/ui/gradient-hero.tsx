"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Gradient Blur (depth / atmosphere) ── */
function GradientBlur({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2 }}
      className={cn("absolute inset-0 pointer-events-none", className)}
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 70%, rgba(94,232,138,0.15) 0%, transparent 60%)",
        filter: "blur(80px)",
        zIndex: 0,
      }}
    />
  );
}

/* ── Main Glow (large soft circle) ── */
function MainGlow({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
      className={cn("absolute pointer-events-none", className)}
      style={{
        width: "70%",
        height: "320px",
        left: "50%",
        top: "35%",
        transform: "translate(-50%, -50%) scale(2.2)",
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse at center, rgba(94,232,138,0.30) 10%, rgba(94,232,138,0) 60%)",
        filter: "blur(50px)",
        zIndex: 0,
      }}
    />
  );
}

/* ── Lamp Effect (softer secondary glow) ── */
function LampEffect({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.8, delay: 0.3 }}
      className={cn("absolute pointer-events-none", className)}
      style={{
        width: "50%",
        height: "180px",
        left: "50%",
        top: "40%",
        transform: "translate(-50%, -50%) scale(2)",
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse at center, rgba(26,86,50,0.35) 10%, rgba(26,86,50,0) 60%)",
        filter: "blur(40px)",
        zIndex: 0,
      }}
    />
  );
}

/* ── Top Line ── */
function TopLine({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn("absolute pointer-events-none", className)}
      style={{
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "80%",
        height: "1px",
        background:
          "linear-gradient(90deg, transparent, rgba(94,232,138,0.5), transparent)",
        zIndex: 0,
      }}
    />
  );
}

/* ── Gradient Cone (angled blob) ── */
function GradientCone({
  side,
  className,
}: {
  side: "left" | "right";
  className?: string;
}) {
  const isLeft = side === "left";
  return (
    <motion.div
      initial={{ opacity: 0, x: isLeft ? -60 : 60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn("absolute pointer-events-none", className)}
      style={{
        [isLeft ? "left" : "right"]: 0,
        top: "15%",
        width: "45%",
        height: "70%",
        background: isLeft
          ? "conic-gradient(from 180deg at 0% 50%, rgba(94,232,138,0.15) 0%, transparent 50%)"
          : "conic-gradient(from 0deg at 100% 50%, rgba(94,232,138,0.15) 0%, transparent 50%)",
        filter: "blur(60px)",
        zIndex: 0,
      }}
    />
  );
}

/* ══════════════════════════════════════════════
   GradientHero — main export
   ══════════════════════════════════════════════ */
export interface GradientHeroProps {
  /** Show gradient background effects */
  gradient?: boolean;
  /** Show blur layer behind content */
  blur?: boolean;
  /** Additional CSS classes on the section */
  className?: string;
  /** Content rendered inside the hero */
  children?: React.ReactNode;
  /** Decorative watermark rendered between effects and content (z-index: 1) */
  watermark?: React.ReactNode;
}

export const GradientHero = React.forwardRef<HTMLElement, GradientHeroProps>(
  ({ gradient = true, blur = true, className, children, watermark }, ref) => {
    return (
      <section
        ref={ref}
        className={cn("relative overflow-hidden", className)}
      >
        {/* ── Background Effects (z-index: 0) ── */}
        {gradient && (
          <>
            {blur && <GradientBlur />}
            <MainGlow />
            <LampEffect />
            <TopLine />
            <GradientCone side="left" />
            <GradientCone side="right" />
          </>
        )}

        {/* ── Watermark layer (z-index: 1) ── */}
        {watermark}

        {/* ── Content (z-index: 2) ── */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {children}
        </div>
      </section>
    );
  }
);
GradientHero.displayName = "GradientHero";
