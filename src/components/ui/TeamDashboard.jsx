import { format, isAfter, subDays } from "date-fns"
import { es } from "date-fns/locale"
import { useNavigate } from "react-router-dom"

const STATE_COLOR = {
  "En desarrollo": "145", "En revisión": "55", "Planificación": "260",
  "Pausado": "27", "Finalizado": "145", "Entregado": "295",
}
const ACTIVE_STATES = new Set(["En desarrollo", "En revisión", "Planificación"])

function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h * 137.508) % 360
}

function avanceColor(v) {
  if (v >= 75) return "oklch(0.62 0.15 145)"   // --success
  if (v >= 50) return "oklch(0.62 0.12 230)"   // --info
  if (v >= 25) return "oklch(0.75 0.15 80)"    // --warning
  return "oklch(0.577 0.245 27.325)"           // --destructive
}

export function TeamDashboard({ colleagues, logs }) {
  const navigate = useNavigate()

  // ── Cómputos ─────────────────────────────────────────────────────────────
  const allProjects = colleagues.flatMap(c =>
    (c.proyectos || []).map(p => ({ ...p, colleague: c }))
  )
  const activeProjects = allProjects.filter(p => ACTIVE_STATES.has(p.estado))
  const avgAvance = allProjects.length > 0
    ? Math.round(allProjects.reduce((s, p) => s + (p.avance || 0), 0) / allProjects.length)
    : 0

  const weekAgo = subDays(new Date(), 7)
  const logsThisWeek = logs.filter(l => {
    const d = l.createdAt?.toDate?.()
    return d && isAfter(d, weekAgo)
  })

  const recentLogs = logs.slice(0, 10)

  // Proyectos activos ordenados por avance asc (los que menos avanzan primero)
  const sortedActive = [...activeProjects].sort((a, b) => (a.avance || 0) - (b.avance || 0))

  // Stats por estado
  const stateCounts = {}
  allProjects.forEach(p => { stateCounts[p.estado] = (stateCounts[p.estado] || 0) + 1 })

  const statCardCls = "bg-card border border-border rounded-2xl p-5 flex flex-col gap-1"
  const labelCls = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"

  return (
    <div className="space-y-7">

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { value: colleagues.length, label: "Personas", sub: "en el equipo", hue: "230" },
          { value: activeProjects.length, label: "Actividades activas", sub: "en curso / revisión", hue: "165" },
          { value: `${avgAvance}%`, label: "Avance promedio", sub: "del equipo", hue: "80" },
          { value: logsThisWeek.length, label: "Notas esta semana", sub: "actividad reciente", hue: "295" },
        ].map((s, i) => (
          <div key={i} className={statCardCls} style={{ borderTop: `3px solid oklch(0.62 0.22 ${s.hue})` }}>
            <span className="text-[32px] font-black tracking-tight leading-none text-foreground">{s.value}</span>
            <span className="text-[14px] font-bold text-foreground">{s.label}</span>
            <span className="text-[12px] text-muted-foreground">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Distribución por estado ─────────────────────────────────────── */}
      {allProjects.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className={labelCls + " mb-4"}>Distribución de actividades</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stateCounts).map(([estado, count]) => {
              const hue = STATE_COLOR[estado] || "260"
              const pct = Math.round((count / allProjects.length) * 100)
              return (
                <div key={estado} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium"
                  style={{ background: `oklch(0.62 0.18 ${hue} / 0.12)`, color: `oklch(0.48 0.20 ${hue})` }}>
                  <span>{estado}</span>
                  <span className="font-bold">{count}</span>
                  <span className="opacity-60">· {pct}%</span>
                </div>
              )
            })}
          </div>
          {/* Barra proporcional */}
          <div className="flex rounded-full overflow-hidden h-2 mt-4 gap-px">
            {Object.entries(stateCounts).map(([estado, count]) => {
              const hue = STATE_COLOR[estado] || "260"
              return (
                <div key={estado} style={{ flex: count, background: `oklch(0.62 0.18 ${hue})` }} title={`${estado}: ${count}`} />
              )
            })}
          </div>
        </div>
      )}

      {/* ── Layout 2 columnas ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Actividades activas (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className={labelCls}>Actividades activas ({activeProjects.length})</p>
          </div>

          {sortedActive.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground text-[13px]">
              Sin actividades activas registradas.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedActive.slice(0, 12).map((p, i) => {
                const hue = STATE_COLOR[p.estado] || "260"
                const ch = hashHue(p.colleague.id)
                const av = p.avance || 0
                return (
                  <button key={i} onClick={() => navigate(`/colleague/${p.colleague.id}`)}
                    className="w-full text-left bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all group">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, oklch(0.68 0.18 ${ch}), oklch(0.54 0.22 ${(ch+40)%360}))` }}>
                        {p.colleague.nombre?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground leading-snug truncate">{p.nombre}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.colleague.nombre?.split(" ").slice(0, 2).join(" ")}
                              {p.area ? ` · ${p.area}` : ""}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
                            style={{ background: `oklch(0.62 0.18 ${hue} / 0.12)`, color: `oklch(0.48 0.20 ${hue})` }}>
                            {p.estado}
                          </span>
                        </div>
                        {/* Avance bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                            <div className="h-full rounded-full transition-all" style={{ width: `${av}%`, background: avanceColor(av) }} />
                          </div>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: avanceColor(av) }}>{av}%</span>
                        </div>
                        {/* Herramientas */}
                        {p.herramientas?.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {p.herramientas.slice(0, 4).map(h => (
                              <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{h}</span>
                            ))}
                            {p.herramientas.length > 4 && (
                              <span className="text-[10px] text-muted-foreground/60">+{p.herramientas.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
              {sortedActive.length > 12 && (
                <p className="text-[12px] text-muted-foreground text-center py-2">
                  +{sortedActive.length - 12} actividades más — ver perfiles individuales
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actividad reciente (2/5) */}
        <div className="lg:col-span-2 space-y-3">
          <p className={labelCls}>Actividad reciente</p>

          {recentLogs.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl py-12 text-center text-muted-foreground text-[13px]">
              Sin actividad registrada.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {recentLogs.map((l, i) => {
                const ch = hashHue(l.colleagueId || l.id)
                const d = l.createdAt?.toDate?.()
                return (
                  <button key={l.id} onClick={() => navigate(`/colleague/${l.colleagueId}`)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 group">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 mt-0.5"
                      style={{ background: `linear-gradient(135deg, oklch(0.68 0.18 ${ch}), oklch(0.54 0.22 ${(ch+40)%360}))` }}>
                      {(l.colleagueName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground leading-snug">
                        {l.colleagueName || "Equipo"}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {l.nota}
                      </p>
                      {d && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1 capitalize">
                          {format(d, "d 'de' MMM · HH:mm", { locale: es })}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Personas con más actividad */}
          {colleagues.length > 0 && (() => {
            const logsByPerson = {}
            logs.forEach(l => {
              if (l.colleagueId) logsByPerson[l.colleagueId] = (logsByPerson[l.colleagueId] || 0) + 1
            })
            const top3 = Object.entries(logsByPerson)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([cid, count]) => ({ colleague: colleagues.find(c => c.id === cid), count }))
              .filter(x => x.colleague)
            if (top3.length === 0) return null
            return (
              <div className="bg-card border border-border rounded-2xl p-4">
                <p className={labelCls + " mb-3"}>Más activos</p>
                <div className="space-y-2">
                  {top3.map(({ colleague: c, count }, idx) => {
                    const ch = hashHue(c.id)
                    return (
                      <button key={c.id} onClick={() => navigate(`/colleague/${c.id}`)}
                        className="w-full flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left">
                        <span className="text-[12px] font-bold text-muted-foreground w-4">{idx + 1}</span>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, oklch(0.68 0.18 ${ch}), oklch(0.54 0.22 ${(ch+40)%360}))` }}>
                          {c.nombre?.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 text-[12px] font-medium text-foreground truncate">
                          {c.nombre?.split(" ").slice(0, 2).join(" ")}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{count} nota{count !== 1 ? "s" : ""}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
