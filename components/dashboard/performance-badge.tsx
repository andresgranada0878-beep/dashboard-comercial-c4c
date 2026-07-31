import { cn } from "@/lib/utils"
import { levelLabel } from "@/lib/indicator-calculator"
import type { PerformanceLevelKey } from "@/types/dashboard"

const STYLES: Record<PerformanceLevelKey | "none", string> = {
  excelente: "bg-[var(--green-dark)] text-white",
  destacado: "bg-[var(--green)] text-white",
  "en-desarrollo": "bg-[var(--warning)] text-white",
  "requiere-mejora": "bg-[var(--critical)] text-white",
  none: "bg-muted text-muted-foreground",
}

const DOT: Record<PerformanceLevelKey | "none", string> = {
  excelente: "bg-[var(--green-dark)]",
  destacado: "bg-[var(--green)]",
  "en-desarrollo": "bg-[var(--warning)]",
  "requiere-mejora": "bg-[var(--critical)]",
  none: "bg-muted-foreground",
}

export function PerformanceBadge({
  level,
  className,
}: {
  level: PerformanceLevelKey | null
  className?: string
}) {
  const key = level ?? "none"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[key],
        className,
      )}
    >
      {levelLabel(level)}
    </span>
  )
}

export function PerformanceDot({
  level,
  className,
}: {
  level: PerformanceLevelKey | null
  className?: string
}) {
  const key = level ?? "none"
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT[key], className)} aria-hidden />
}
