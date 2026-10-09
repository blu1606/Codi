"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { cn } from "@codi-1/ui/lib/utils";
import styles from "./home-scroll-reveal.module.css";

interface HomeScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
}

export default function HomeScrollReveal({
  children,
  className,
  delay = 0,
  distance = 20,
}: HomeScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const desktop = window.matchMedia("(min-width: 1024px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let visible = false;

    const showImmediately = () => {
      visible = true;
      controls.stop();
      controls.set({ opacity: 1, y: 0 });
    };

    const hide = (top: number) => {
      visible = false;
      controls.stop();
      controls.set({ opacity: 0, y: top < 0 ? -distance : distance });
    };

    const syncMotion = () => {
      observer?.disconnect();
      if (!desktop.matches || reducedMotion.matches || !("IntersectionObserver" in window)) {
        showImmediately();
        return;
      }

      // Keep server-rendered content visible until desktop motion is available.
      if (element.contains(document.activeElement)) showImmediately();
      else hide(element.getBoundingClientRect().top);

      observer = new IntersectionObserver(([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting) {
          // Reset only after leaving the viewport completely to avoid edge flicker.
          if (!element.contains(document.activeElement)) hide(entry.boundingClientRect.top);
          return;
        }
        if (visible || entry.intersectionRatio < 0.2) return;
        visible = true;
        void controls.start({
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
        });
      }, { threshold: [0, 0.2] });
      observer.observe(element);
    };

    syncMotion();
    desktop.addEventListener("change", syncMotion);
    reducedMotion.addEventListener("change", syncMotion);
    // Keyboard navigation must never focus a still-hidden link or button.
    element.addEventListener("focusin", showImmediately);

    return () => {
      observer?.disconnect();
      desktop.removeEventListener("change", syncMotion);
      reducedMotion.removeEventListener("change", syncMotion);
      element.removeEventListener("focusin", showImmediately);
      controls.stop();
    };
  }, [controls, delay, distance]);

  return (
    <motion.div
      ref={ref}
      className={cn(styles.reveal, className)}
      initial={false}
      animate={controls}
    >
      {children}
    </motion.div>
  );
}
