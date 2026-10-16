import { useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { isEnLicencia, licenciaIcono } from "@/services/colleagues.service"

const fmt = (str) => {
  const [y, m, d] = str.split("-").map(Number)
  return format(new Date(y, m - 1, d), "d MMM", { locale: es })
}

// Lista de personas en licencia hoy. semilleros (opcional) muestra a qué equipo pertenece cada una.
export function LicenciasBanner({ colleagues, semilleros }) {
  const navigate = useNavigate()
  const enLicencia = colleagues.filter(c => isEnLicencia(c))
  if (enLicencia.length === 0) return null

  return (
    <div className="rounded-2xl px-5 py-4"
      style={{ backgroundColor: "oklch(0.65 0.14 330 / 0.10)", border: "1px solid oklch(0.65 0.14 330 / 0.35)" }}>
      <p className="text-[13px] font-semibold text-foreground mb-2.5">
        {enLicencia.length} persona{enLicencia.length !== 1 ? "s" : ""} en licencia
        <span className="font-normal text-muted-foreground"> — no requieren bitácora</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {enLicencia.map(c => {
          const l = c.licencia
          const sem = semilleros?.find(s => s.id === c.semilleroId)
          return (
            <button key={c.id} onClick={() => navigate(`/semillero/${c.semilleroId}/colleague/${c.id}`)}
              className="text-left text-[12px] px-3 py-1.5 rounded-xl bg-card border border-border hover:opacity-80 transition-opacity">
              <span className="font-medium text-foreground">{licenciaIcono(l.tipo)} {c.nombre}</span>
              <span className="text-muted-foreground">
                {" · "}{l.tipo}{" · "}{l.hasta ? `hasta ${fmt(l.hasta)}` : `desde ${fmt(l.desde)}`}
                {sem ? ` · ${sem.nombre}` : ""}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
