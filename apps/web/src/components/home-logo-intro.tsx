"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BrandLogo from "./brand-logo";
import styles from "./home-logo-intro.module.css";

const GROW_DURATION = 1800;
const HOLD_DURATION = 200;
const TRAVEL_DURATION = 1350;
const MENU_DURATION = 700;
const MENU_STAGGER = 140;
const HERO_DURATION = 500;
const HERO_STAGGER = 120;
const IMAGE_DURATION = 350;
const IMAGE_STAGGER = 90;

export default function HomeLogoIntro() {
  const pathname = usePathname();
  // Mount the intro after hydration, including when navigating home from another page.
  // Its fallback timer must not run while the browser is still loading JavaScript.
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(pathname === "/" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [pathname]);

  useLayoutEffect(() => {
    if (!active) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Recheck before any WAAPI call in case the preference changed after activation.
    if (reducedMotion.matches) {
      setActive(false);
      return;
    }
    const target = document.querySelector<HTMLElement>("[data-codi-logo]");
    const overlay = overlayRef.current;
    const backdrop = backdropRef.current;
    const logo = logoRef.current;
    const mark = markRef.current;
    const finish = () => setActive(false);

    if (pathname !== "/" || !target || !overlay || !backdrop || !logo || !mark || !logo.animate) {
      finish();
      return;
    }

    const animations: Animation[] = [];
    let finishFrame = 0;
    let disposed = false;
    const startScale = 0.65;
    const peakScale = 3.3;
    const pulseOpacity = 0.3;

    const revealHero = () => {
      if (disposed) return [];
      const items = Array.from(document.querySelectorAll<HTMLElement>("[data-codi-intro-hero]"));
      const fromY = -28;
      const heroAnimations = items.map((item, index) => item.animate(
        [
          { transform: `translate3d(0, ${fromY}px, 0)`, opacity: 0, visibility: "visible" },
          { transform: "translate3d(0, 0, 0)", opacity: 1, visibility: "visible" },
        ],
        {
          duration: HERO_DURATION,
          delay: index * HERO_STAGGER,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      ));
      animations.push(...heroAnimations);
      return heroAnimations;
    };

    const revealImages = () => {
      if (disposed) return [];
      const items = Array.from(document.querySelectorAll<HTMLElement>("[data-codi-intro-image]"));
      const fromX = 80;
      const imageAnimations = items.map((item, index) => item.animate(
        [
          { transform: `translate3d(${fromX}px, 0, 0)`, opacity: 0, visibility: "visible" },
          { transform: "translate3d(0, 0, 0)", opacity: 1, visibility: "visible" },
        ],
        {
          duration: IMAGE_DURATION,
          delay: index * IMAGE_STAGGER,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      ));
      animations.push(...imageAnimations);
      return imageAnimations;
    };

    const revealHeaderAndHero = () => {
      if (disposed) return;
      const origin = target.getBoundingClientRect().right + 16;
      const items = Array.from(document.querySelectorAll<HTMLElement>(
        "[data-codi-intro-nav] [data-slot='navigation-menu-item']",
      )).filter((item) => item.getBoundingClientRect().width > 0);

      const headerAnimations = items.map((item, index) => {
        // Each item emerges just to the right of Codi, then settles into its own slot.
        const fromX = origin - item.getBoundingClientRect().left;
        return item.animate(
          [
            { transform: `translate3d(${fromX}px, 0, 0)`, opacity: 0, visibility: "visible" },
            { transform: "translate3d(0, 0, 0)", opacity: 1, visibility: "visible" },
          ],
          {
            duration: MENU_DURATION,
            delay: index * MENU_STAGGER,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        );
      });
      // Animate the stable wrapper so session loading can swap Sign In for the account
      // without replacing the animated element. Stay inside the viewport on mobile.
      const account = document.querySelector<HTMLElement>("[data-codi-intro-account]");
      if (account) {
        const availableSpace = Math.max(0, document.documentElement.clientWidth - account.getBoundingClientRect().right);
        const fromX = Math.min(40, availableSpace);
        headerAnimations.push(account.animate(
          [
            { transform: `translate3d(${fromX}px, 0, 0)`, opacity: 0, visibility: "visible" },
            { transform: "translate3d(0, 0, 0)", opacity: 1, visibility: "visible" },
          ],
          {
            duration: 850,
            delay: items.length ? MENU_STAGGER * 2 : 0,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        ));
      }
      animations.push(...headerAnimations);
      // Start the header, text and images together; wait for every section to finish.
      const heroAnimations = revealHero();
      const imageAnimations = revealImages();
      void Promise.all([...headerAnimations, ...heroAnimations, ...imageAnimations].map((animation) => animation.finished)).then(() => {
        if (disposed) return;
        // Paint the final positions before removing the overlay and animation styles.
        finishFrame = requestAnimationFrame(() => {
          finishFrame = requestAnimationFrame(() => { if (!disposed) finish(); });
        });
      }, () => {});
    };

    const grow = mark.animate(
      [{ transform: `scale(${startScale})` }, { transform: `scale(${peakScale})` }],
      { duration: GROW_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
    );
    const pulse = mark.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.15 },
        { opacity: pulseOpacity, offset: 0.3 },
        { opacity: 1, offset: 0.45 },
        { opacity: 1, offset: 0.55 },
        { opacity: pulseOpacity, offset: 0.7 },
        { opacity: 1, offset: 0.85 },
        { opacity: 1, offset: 1 },
      ],
      { duration: GROW_DURATION, easing: "linear", fill: "forwards" },
    );
    animations.push(grow, pulse);

    // Sequence from the animation itself so a slow frame cannot skip the journey.
    void grow.finished.then(
      () => {
        if (disposed) return;
        // Measure after growth, once fonts/layout and scroll restoration have settled.
        const destination = target.getBoundingClientRect();
        const viewport = overlay.getBoundingClientRect();
        const x = destination.left + destination.width / 2 - (viewport.left + viewport.width / 2);
        const y = destination.top + destination.height / 2 - (viewport.top + viewport.height / 2);
        const timing: KeyframeAnimationOptions = {
          delay: HOLD_DURATION,
          duration: TRAVEL_DURATION,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          fill: "both",
        };

        // Move the same visible logo all the way to the header; never fade it out.
        // A separate inner scale keeps growth and travel from replacing each other.
        const travel = logo.animate(
          [
            { transform: "translate(-50%, -50%) translate3d(0px, 0px, 0px)" },
            { transform: `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0px)` },
          ],
          timing,
        );
        const shrink = mark.animate(
          [{ transform: `scale(${peakScale})` }, { transform: "scale(1)" }],
          timing,
        );
        const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], timing);
        animations.push(travel, shrink, fade);
        // Cancellation rejects finished during unmount/Strict Mode.
        void travel.finished.then(revealHeaderAndHero, () => {});
      },
      () => {},
    );

    const fallbackTimer = window.setTimeout(finish, 8000);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") finish();
    };
    window.addEventListener("keydown", onKeyDown);
    reducedMotion.addEventListener("change", finish);

    return () => {
      disposed = true;
      window.clearTimeout(fallbackTimer);
      cancelAnimationFrame(finishFrame);
      animations.forEach((animation) => animation.cancel());
      window.removeEventListener("keydown", onKeyDown);
      reducedMotion.removeEventListener("change", finish);
    };
  }, [active, pathname]);

  if (!active || pathname !== "/") return null;

  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
      <div ref={backdropRef} className={styles.backdrop} />
      <div ref={logoRef} className={styles.logo}>
        <div ref={markRef} className={styles.mark}>
          <BrandLogo />
        </div>
      </div>
    </div>
  );
}
