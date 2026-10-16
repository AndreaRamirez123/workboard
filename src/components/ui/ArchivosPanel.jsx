import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { listColleagueFiles } from "@/services/storage.service"
import { downloadFile } from "@/utils/download"

const ORIGEN = {
  proyectos:  (f) => f.subcarpeta ? `Actividad: ${f.subcarpeta}` : "Actividad",
  documentos: (f) => f.subcarpeta ? `Actividad: ${f.subcarpeta}` : "Documento",
  logs:       () => "Bitácora",
  tareas:     () => "Tarea",
}

const kb = (n) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

// Lista todo lo que hay guardado en Storage para un compañero, esté o no vinculado a una actividad/nota.
export function ArchivosPanel({ colleagueId, carpetas, titulo }) {
  const [files, setFiles] = useState(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    setFiles(null)
    listColleagueFiles(colleagueId, carpetas).then(setFiles).catch(() => setFiles([]))
  }, [colleagueId, carpetas.join(",")])

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors text-left">
        <span className="text-[13px] font-semibold text-foreground">
          📁 {titulo} <span className="text-muted-foreground font-normal">({files === null ? "…" : files.length})</span>
        </span>
        <span className="text-[11px] text-muted-foreground">{open ? "Ocultar ↑" : "Ver ↓"}</span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border/60">
          {files === null ? (
            <p className="px-5 py-4 text-[12px] text-muted-foreground">Buscando archivos…</p>
          ) : files.length === 0 ? (
            <p className="px-5 py-4 text-[12px] text-muted-foreground">No hay archivos guardados.</p>
          ) : files.map(f => {
            const isPdf = f.tipo.includes("pdf") || f.nombre.toLowerCase().endsWith(".pdf")
            const isOpen = preview === f.storagePath
            return (
              <div key={f.storagePath}>
                <div className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-base leading-none">{isPdf ? "📄" : "📎"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{f.nombre}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {(ORIGEN[f.carpeta] || (() => f.carpeta))(f)}
                      {f.fecha && ` · ${format(f.fecha, "d MMM yyyy, HH:mm", { locale: es })}`}
                      {f.size > 0 && ` · ${kb(f.size)}`}
                    </p>
                  </div>
                  {isPdf && (
                    <button onClick={() => setPreview(isOpen ? null : f.storagePath)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                      {isOpen ? "Cerrar" : "Ver"}
                    </button>
                  )}
                  <button onClick={() => downloadFile(f.url, f.nombre)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white flex-shrink-0"
                    style={{ backgroundColor: "oklch(0.52 0.13 165)" }}>
                    Descargar
                  </button>
                </div>
                {isPdf && isOpen && (
                  <iframe src={f.url} title={f.nombre} className="w-full border-t border-border" style={{ height: "500px" }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
