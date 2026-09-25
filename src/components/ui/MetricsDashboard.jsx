import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { format, subWeeks, startOfWeek } from "date-fns"
import { es } from "date-fns/locale"
import { exportPDF, exportExcel } from "@/utils/exportReport"
import { useState } from "react"
import { FileDown, Sheet, ChevronDown, ChevronUp } from "lucide-react"

// Misma lógica que ColleagueDetail para calcular avance real desde el estado
const ESTADO_AVANCE = {
  "Formulación": 10,
  "En ejecución": 50,
  "En evaluación": 80,
  "Finalizado": 100,
  "Hecho": 100,
  "Suspendido": 0,
}
function getAvance(p) {
  const stored = Number(p.avance) || 0
  if (stored > 0) return stored
  return ESTADO_AVANCE[p.estado] ?? 0
}

const PALETTE = [
  "#1fa882", "#7c52e0", "#d4893a", "#4a80c7", "#c25060",
  "#34d399", "#a78bfa", "#fb923c", "#60a5fa", "#f472b6",
]
const HUE_BY_IDX = [145, 270, 40, 210, 350, 160, 280, 30, 200, 320]

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
}
const labelStyle = { fontSize: 11, fill: "var(--muted-foreground)" }

function SectionTitle({ children }) {
  return (
    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
      {children}
    </p>
  )
}

function barColor(v) {
  if (v >= 75) return "#1fa882"
  if (v >= 50) return "#4a80c7"
  if (v >= 25) return "#d4893a"
  return "#c25060"
}

function shortName(nombre = "") {
  const parts = nombre.trim().split(/\s+/)
  if (parts.length <= 2) return nombre.trim()
  return `${parts[0]} ${parts[parts.length - 1]}`
}

function Avatar({ nombre, idx }) {
  const hue = HUE_BY_IDX[idx % HUE_BY_IDX.length]
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
      style={{ background: `linear-gradient(135deg, oklch(0.58 0.18 ${hue}), oklch(0.44 0.22 ${(hue + 40) % 360}))` }}>
      {nombre?.charAt(0)?.toUpperCase() || "?"}
    </div>
  )
}

const SORT_OPTIONS = [
  { key: "carga", label: "Más actividades activas" },
  { key: "avance", label: "Más avance" },
  { key: "nombre", label: "Alfabético" },
]

export function MetricsDashboard({ colleagues, logs }) {
  const [exporting, setExporting] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sortKey, setSortKey] = useState("carga")

  const handleExport = async (type) => {
    setExporting(type)
    if (type === "pdf") exportPDF(colleagues, logs)
    else exportExcel(colleagues, logs)
    setTimeout(() => setExporting(null), 1000)
  }

  const now = new Date()

  // ── Deduplicar personas ───────────────────────────────────
  const richness = c => (c.proyectos?.length || 0) * 10 + (c.herramientas?.length || 0) * 2 + (c.rol ? 5 : 0) + (c.nombre?.length || 0)
  const byEmail = new Map()
  const noEmail = []
  for (const c of colleagues) {
    const email = (c.email || "").trim().toLowerCase()
    if (email) {
      const ex = byEmail.get(email)
      if (!ex || richness(c) > richness(ex)) byEmail.set(email, c)
    } else noEmail.push(c)
  }
  const seenNames = new Set([...byEmail.values()].map(c => (c.nombre || "").trim().toLowerCase()))
  const deduped = [...byEmail.values()]
  for (const c of noEmail) {
    const nk = (c.nombre || "").trim().toLowerCase()
    if (!nk || seenNames.has(nk)) continue
    seenNames.add(nk); deduped.push(c)
  }

  // ── Métricas por persona ──────────────────────────────────
  const personRows = deduped.map((c, idx) => {
    const proyectos = c.proyectos || []
    const activas = proyectos.filter(p =>
      p.estado !== "Finalizado" && p.estado !== "Hecho" && p.estado !== "Suspendido" && getAvance(p) < 100
    )
    const finalizadas = proyectos.filter(p =>
      p.estado === "Finalizado" || p.estado === "Hecho" || getAvance(p) >= 100
    ).length
    const avgs = proyectos.map(p => getAvance(p))
    const avgAvance = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null
    // Carga = activas * avance promedio de activas (quien tiene más trabajo Y más avance primero)
    const avgActivas = activas.length ? Math.round(activas.reduce((s, p) => s + getAvance(p), 0) / activas.length) : 0
    const cargaScore = activas.length * 100 + avgActivas
    const logCount = logs.filter(l => l.colleagueId === c.id).length
    return { ...c, idx, total: proyectos.length, activas: activas.length, finalizadas, avgAvance, cargaScore, logCount }
  })

  const sorted = [...personRows].sort((a, b) => {
    if (sortKey === "avance") return (b.avgAvance ?? -1) - (a.avgAvance ?? -1)
    if (sortKey === "nombre") return (a.nombre || "").localeCompare(b.nombre || "", "es")
    return b.cargaScore - a.cargaScore // default: por carga
  })

  const activeRows = sorted.filter(r => r.total > 0 || r.logCount > 0)
  const inactiveRows = sorted
    .filter(r => r.total === 0 && r.logCount === 0)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"))

  // ── Gráfico avance — ordenado por carga (no solo por %) ──
  const avanceData = [...personRows]
    .filter(c => c.total > 0)
    .sort((a, b) => b.cargaScore - a.cargaScore)
    .map(c => ({ name: shortName(c.nombre), avg: c.avgAvance ?? 0, idx: c.idx }))

  const avanceChartH = Math.max(200, avanceData.length * 28)

  // ── Estado de actividades ─────────────────────────────────
  const stateCounts = {}
  colleagues.forEach(c =>
    (c.proyectos || []).forEach(p => {
      const s = p.estado || "Sin estado"
      stateCounts[s] = (stateCounts[s] || 0) + 1
    })
  )
  const stateData = Object.entries(stateCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  // ── Actividad semanal ─────────────────────────────────────
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = startOfWeek(subWeeks(now, 7 - i), { weekStartsOn: 1 })
    return { start, label: format(start, "d MMM", { locale: es }) }
  })
  const weekData = weeks.map(({ start, label }) => {
    const end = new Date(start.getTime() + 7 * 86400000)
    const count = logs.filter(l => {
      const d = l.createdAt?.toDate?.()
      return d && d >= start && d < end
    }).length
    return { label, notas: count }
  })

  // ── Herramientas ─────────────────────────────────────────
  const toolCounts = {}
  colleagues.forEach(c =>
    (c.herramientas || []).forEach(t => { toolCounts[t] = (toolCounts[t] || 0) + 1 })
  )
  const toolData = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // ── Resumen ───────────────────────────────────────────────
  const totalProyectos = deduped.reduce((s, c) => s + (c.proyectos?.length || 0), 0)
  const allAvances = deduped.flatMap(c => (c.proyectos || []).map(p => getAvance(p)))
  const avgGeneral = allAvances.length ? Math.round(allAvances.reduce((a, b) => a + b, 0) / allAvances.length) : 0
  const logsUltimoMes = logs.filter(l => {
    const d = l.createdAt?.toDate?.()
    return d && d >= new Date(now.getTime() - 30 * 86400000)
  }).length
  const herramientasUnicas = new Set(deduped.flatMap(c => c.herramientas || [])).size

  const noData = (msg) => (
    <div className="flex items-center justify-center h-32 text-[12px] text-muted-foreground italic">{msg}</div>
  )

  return (
    <div className="space-y-6">

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: totalProyectos, label: "Actividades totales", hue: 295 },
          { value: `${avgGeneral}%`, label: "Avance promedio", hue: 145 },
          { value: logsUltimoMes, label: "Notas este mes", hue: 260 },
          { value: herramientasUnicas, label: "Herramientas distintas", hue: 55 },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-2xl px-4 py-3.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-14 h-14 pointer-events-none opacity-20"
              style={{ background: `radial-gradient(circle at top right, oklch(0.65 0.18 ${s.hue}), transparent 70%)`, filter: "blur(14px)" }} />
            <p className="text-[26px] font-bold text-foreground leading-none">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Estado */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Estado de actividades</SectionTitle>
          {stateData.length === 0 ? noData("Sin actividades registradas") : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stateData} cx="50%" cy="50%" outerRadius={72} innerRadius={36}
                    dataKey="value" paddingAngle={3}>
                    {stateData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {stateData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="text-[11px] text-muted-foreground">{d.name} <strong className="text-foreground">{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actividad semanal */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Notas en bitácora — últimas 8 semanas</SectionTitle>
          {logs.length === 0 ? noData("Sin notas registradas") : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekData} barSize={20}>
                <XAxis dataKey="label" tick={labelStyle} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={labelStyle} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(0.55 0.18 260 / 0.08)" }}
                  formatter={v => [v, "Notas"]} />
                <Bar dataKey="notas" name="Notas" radius={[4, 4, 0, 0]}>
                  {weekData.map((d, i) => (
                    <Cell key={i} fill={d.notas === 0 ? "oklch(0.40 0.02 260 / 0.25)" : "#a78bfa"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Herramientas */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Herramientas más usadas</SectionTitle>
          {toolData.length === 0 ? noData("Sin herramientas registradas") : (
            <ResponsiveContainer width="100%" height={Math.max(200, toolData.length * 28)}>
              <BarChart data={toolData} layout="vertical" barSize={14}>
                <XAxis type="number" allowDecimals={false} tick={labelStyle} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={labelStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [v, "Personas"]} cursor={{ fill: "oklch(0.55 0.18 260 / 0.08)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {toolData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Avance por persona */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Avance promedio por persona</SectionTitle>
          <p className="text-[11px] text-muted-foreground mb-3 -mt-2">
            Ordenado por actividades activas · quien tiene más trabajo en curso aparece primero
          </p>
          {avanceData.length === 0 ? noData("Sin actividades registradas") : (
            <div style={{ overflowY: "auto", maxHeight: 320 }}>
              <ResponsiveContainer width="100%" height={avanceChartH}>
                <BarChart data={avanceData} layout="vertical" barSize={14}>
                  <XAxis type="number" domain={[0, 100]} tick={labelStyle} axisLine={false}
                    tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={120} tick={labelStyle}
                    axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`, "Avance promedio"]}
                    cursor={{ fill: "oklch(0.55 0.18 260 / 0.08)" }} />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                    {avanceData.map((d, i) => <Cell key={i} fill={barColor(d.avg)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {[
              { label: "≥75% Avanzado", color: "#1fa882" },
              { label: "≥50% En curso", color: "#4a80c7" },
              { label: "≥25% Iniciado", color: "#d4893a" },
              { label: "<25%", color: "#c25060" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                <span className="text-[10px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Análisis por persona */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <SectionTitle>Quién está haciendo qué</SectionTitle>
            <p className="text-[11px] text-muted-foreground -mt-3">
              {activeRows.length} con actividades registradas · {inactiveRows.length} sin registros
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {SORT_OPTIONS.map(o => (
              <button key={o.key} onClick={() => setSortKey(o.key)}
                className="text-[11px] px-2.5 py-1 rounded-lg border transition-all"
                style={{
                  borderColor: sortKey === o.key ? "var(--primary)" : "var(--border)",
                  background: sortKey === o.key ? "oklch(0.52 0.14 260 / 0.12)" : "transparent",
                  color: sortKey === o.key ? "var(--primary)" : "var(--muted-foreground)",
                  fontWeight: sortKey === o.key ? 600 : 400,
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cabecera */}
        {activeRows.length > 0 && (
          <div className="grid pb-2 mb-1 border-b border-border/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
            style={{ gridTemplateColumns: "32px 1fr 90px 110px" }}>
            <div />
            <div>Persona</div>
            <div className="text-center">Actividades</div>
            <div className="text-right pr-1">Avance promedio</div>
          </div>
        )}

        {/* Filas */}
        {personRows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Sin compañeros registrados.</p>
        ) : activeRows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-4 text-center">Nadie ha registrado actividades aún.</p>
        ) : activeRows.map(c => (
          <div key={c.id}
            className="grid items-center gap-3 py-2.5 border-b border-border/30 last:border-0"
            style={{ gridTemplateColumns: "32px 1fr 90px 110px" }}>

            <Avatar nombre={c.nombre} idx={c.idx} />

            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{c.nombre}</p>
              {c.rol && <p className="text-[11px] text-muted-foreground truncate">{c.rol}</p>}
            </div>

            {/* Actividades */}
            <div className="text-center">
              <p className="text-[20px] font-bold text-foreground leading-none">{c.total}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {c.activas > 0 && <span style={{ color: "oklch(0.52 0.18 145)" }}>{c.activas} activa{c.activas !== 1 ? "s" : ""}</span>}
                {c.finalizadas > 0 && <span className="text-muted-foreground"> · {c.finalizadas} fin.</span>}
              </p>
            </div>

            {/* Avance */}
            <div>
              {c.avgAvance !== null ? (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold" style={{ color: barColor(c.avgAvance) }}>{c.avgAvance}%</span>
                    <span className="text-muted-foreground text-[10px]">
                      {c.avgAvance >= 75 ? "Avanzado" : c.avgAvance >= 50 ? "En curso" : c.avgAvance >= 25 ? "Iniciado" : "Mínimo"}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden bg-muted">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${c.avgAvance}%`, background: barColor(c.avgAvance) }} />
                  </div>
                </div>
              ) : <p className="text-[11px] text-muted-foreground text-right pr-1">—</p>}
            </div>
          </div>
        ))}

        {/* Sin actividad */}
        {inactiveRows.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <button onClick={() => setShowInactive(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors select-none py-1 w-full text-left">
              {showInactive ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {inactiveRows.length} persona{inactiveRows.length !== 1 ? "s" : ""} sin actividades ni notas
            </button>
            {showInactive && (
              <div className="mt-2 space-y-1 overflow-y-auto" style={{ maxHeight: 200 }}>
                {inactiveRows.map(c => (
                  <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-border/20 last:border-0 opacity-60">
                    <Avatar nombre={c.nombre} idx={c.idx} />
                    <span className="text-[12px] text-muted-foreground flex-1 truncate">{c.nombre}</span>
                    {c.rol && <span className="text-[10px] text-muted-foreground/60">{c.rol}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exportar */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Exportar reporte</SectionTitle>
        <p className="text-[12px] text-muted-foreground mb-4">
          Reporte completo con actividades, avances y bitácora.
        </p>
        <div className="flex gap-3">
          <button onClick={() => handleExport("pdf")} disabled={!!exporting}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-medium border border-border text-foreground hover:bg-muted transition-all disabled:opacity-40">
            <FileDown size={14} />
            {exporting === "pdf" ? "Generando…" : "Descargar PDF"}
          </button>
          <button onClick={() => handleExport("xlsx")} disabled={!!exporting}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-medium border border-border text-foreground hover:bg-muted transition-all disabled:opacity-40">
            <Sheet size={14} />
            {exporting === "xlsx" ? "Generando…" : "Descargar Excel"}
          </button>
        </div>
      </div>

    </div>
  )
}
