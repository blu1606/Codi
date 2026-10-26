import { Code2 } from "lucide-react";

export default function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Code2 aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
        Codi
      </span>
    </span>
  );
}
