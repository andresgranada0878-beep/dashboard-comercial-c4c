"use client"

import Image from "next/image"
import { Download, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDashboard } from "@/components/dashboard/dashboard-provider"
import { formatDateTime } from "@/lib/format"

export function DashboardHeader({ onExport, exporting }: { onExport: () => void; exporting: boolean }) {
  const { data, refresh, isLoading } = useDashboard()

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logos/perez-cardona.png"
              alt="Pérez y Cardona"
              width={132}
              height={52}
              className="h-11 w-auto object-contain"
              priority
            />
            <span className="h-9 w-px bg-border" aria-hidden />
            <Image
              src="/logos/galagro.png"
              alt="Galagro"
              width={72}
              height={52}
              className="h-11 w-auto object-contain"
              priority
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 md:items-end">
          <h1 className="text-balance text-lg font-semibold text-primary md:text-xl">
            Dashboard Comercial C4C
          </h1>
          <p className="text-xs text-muted-foreground">
            {data ? (
              <>
                Fuente: {data.meta.fileName} · Actualizado {formatDateTime(data.meta.loadedAt)}
              </>
            ) : (
              "Cargando informe…"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="gap-2 bg-transparent"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button size="sm" onClick={onExport} disabled={exporting || !data} className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{exporting ? "Generando…" : "Exportar PDF"}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
