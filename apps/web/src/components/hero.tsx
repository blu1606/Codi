"use client";

import { motion, type Variants } from "framer-motion";
import { Rocket } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { cn } from "@codi-1/ui/lib/utils";
import React from "react";
import styles from "./hero.module.css";

// Define the props for reusability
export interface StatProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ActionProps {
  text: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  className?: string;
}

export interface HeroProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle: string;
  actions: ActionProps[];
  stats: StatProps[];
  images: string[];
  className?: string;
}

const floatingVariants: Variants = {
  animate: {
    y: [0, -8, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export default function Hero({
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  images,
  className,
}: HeroProps) {
  return (
    <section className={cn("w-full overflow-hidden bg-background py-12 sm:py-24", className)}>
      <div className="container mx-auto grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-8 px-4 sm:px-6">
        {/* Left Column: Text Content */}
        <div
          className={cn(styles.content, "flex min-w-0 flex-col items-start text-left")}
        >
          {eyebrow && (
            <div
              data-codi-intro-hero
              className="mb-5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold leading-relaxed tracking-wide text-primary uppercase sm:text-[11px]"
            >
              <Rocket aria-hidden="true" className="size-3 shrink-0" />
              <span>{eyebrow}</span>
            </div>
          )}
          <h1
            data-codi-intro-hero
            className="text-4xl font-extrabold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[44px] xl:text-5xl"
          >
            {title}
          </h1>
          <p data-codi-intro-hero className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base">
            {subtitle}
          </p>
          <div data-codi-intro-hero className="mt-7 flex flex-wrap items-center gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                onClick={action.onClick}
                variant={action.variant}
                size="lg"
                className={cn("h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold", action.className)}
              >
                {action.text}
              </Button>
            ))}
          </div>
          <div data-codi-intro-hero className="mt-10 flex flex-wrap gap-x-8 gap-y-5 sm:mt-12 sm:gap-x-10">
            {stats.map((stat, index) => (
              <div key={index} className="flex items-center gap-3">
                {stat.icon && <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">{stat.icon}</div>}
                <div>
                  <p className="text-2xl font-extrabold tracking-tight text-foreground">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Image Collage */}
        <div
          className="relative h-[400px] w-full sm:h-[500px]"
        >
          {/* Decorative Shapes */}
          <motion.div
            className="absolute -top-4 left-1/4 h-16 w-16 rounded-full bg-primary/10 border border-primary/20"
            variants={floatingVariants}
            animate="animate"
          />
          <motion.div
            className="absolute bottom-0 right-1/4 h-12 w-12 rounded-lg bg-primary/15"
            variants={floatingVariants}
            animate="animate"
            transition={{ delay: 0.5 }}
          />
          <motion.div
            className="absolute bottom-1/4 left-4 h-6 w-6 rounded-full bg-accent border border-border"
            variants={floatingVariants}
            animate="animate"
            transition={{ delay: 1 }}
          />

          {/* Images */}
          <div
            data-codi-intro-image
            className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-2xl bg-muted p-2 shadow-lg sm:h-64 sm:w-64"
            style={{ transformOrigin: "bottom center" }}
          >
            <img
              src={images[0]}
              alt="Student learning"
              width={256}
              height={256}
              loading="eager"
              className="h-full w-full rounded-xl object-cover"
            />
          </div>
          <div
            data-codi-intro-image
            className="absolute right-0 top-1/3 h-40 w-40 rounded-2xl bg-muted p-2 shadow-lg sm:h-56 sm:w-56"
            style={{ transformOrigin: "left center" }}
          >
            <img
              src={images[1]}
              alt="Tutor assisting"
              width={224}
              height={224}
              loading="eager"
              className="h-full w-full rounded-xl object-cover"
            />
          </div>
          <div
            data-codi-intro-image
            className="absolute bottom-0 left-0 h-32 w-32 rounded-2xl bg-muted p-2 shadow-lg sm:h-48 sm:w-48"
            style={{ transformOrigin: "top right" }}
          >
            <img
              src={images[2]}
              alt="Collaborative discussion"
              width={192}
              height={192}
              loading="eager"
              className="h-full w-full rounded-xl object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
