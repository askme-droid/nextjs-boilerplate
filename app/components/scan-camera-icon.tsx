import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Camera glyph with a "scanner" line sweeping over it — the visual shorthand
 * for photo search. `always` keeps the line moving (the hero invitation);
 * otherwise it only appears while a parent marked `group/scan` is hovered or
 * focused. The line is hidden entirely for reduced-motion visitors.
 */
export function ScanCameraIcon({ always = false, className }: { always?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-5 shrink-0 overflow-hidden", className)}>
      <Camera className="size-5" />
      <span
        className={cn(
          "absolute inset-x-[3px] hidden h-0.5 rounded-full bg-brand-orange shadow-[0_0_6px_1px] shadow-brand-orange motion-safe:block motion-safe:animate-scan-line",
          !always && "motion-safe:opacity-0 motion-safe:group-hover/scan:opacity-100 motion-safe:group-focus-visible/scan:opacity-100",
        )}
      />
    </span>
  );
}
