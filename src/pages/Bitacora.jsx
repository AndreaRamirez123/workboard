import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { getAllLogs, deleteLog, updateLog } from "@/services/logs.service"
import { getColleagues, isEnLicencia } from "@/services/colleagues.service"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { Footer } from "@/components/ui/Footer"
import { format, startOfWeek, endOfWeek, isWithinInterval } from "date-fns"
import { es } from "date-fns/locale"

function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h * 137.508) % 360
}

export default function Bitacora() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [colleagueMap, setColleagueMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState("")

  const load = async () => {
    const [allLogs, colleagues] = await Promise.all([getAllLogs(), getColleagues()])
    const map = {}
    colleagues.forEach(c => { map[c.id] = c })
    setColleagueMap(map)
    setLogs(allLogs)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const handleDeleteLog = async (logId) => {
    if (!confirm("¿Eliminar esta nota?")) return
    await deleteLog(logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  const handleSaveEdit = async (logId) => {
    if (!editingText.trim()) return
    await updateLog(logId, editingText.trim())
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, nota: editingText.trim() } : l))
    setEditingId(null)
  }

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const thisWeek = logs.filter(log => {
    if (!log.createdAt?.toDate) return false
    if (!colleagueMap[log.colleagueId]) return false
    return isWithinInterval(log.createdAt.toDate(), { start: weekStart, end: weekEnd })
  })

  const grouped = thisWeek.reduce((acc, log) => {
    if (!acc[log.colleagueId]) acc[log.colleagueId] = { name: log.colleagueName, logs: [] }
    acc[log.colleagueId].logs.push(log)
    return acc
  }, {})

  const totalNotas = thisWeek.length
  const totalPersonas = Object.keys(grouped).length
  const enLicencia = Object.values(colleagueMap).filter(c => isEnLicencia(c))

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-border/60 px-6 py-3 flex justify-between items-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/dashboard")}
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Volver
        </button>
        <ThemeToggle />
      </header>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden px-6 py-12"
        style={{ background: "linear-gradient(145deg, oklch(0.20 0.050 295), oklch(0.14 0.030 318))" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-80 h-80 opacity-25"
            style={{ background: "radial-gradient(circle at top right, oklch(0.72 0.18 295), transparent 65%)", filter: "blur(50px)" }} />
        </div>
        <div className="max-w-4xl mx-auto w-full relative">
          <h1 className="text-[30px] font-bold text-white tracking-tight leading-none">Bitácora semanal</h1>
          <p className="text-[13px] mt-2 mb-5" style={{ color: "oklch(0.78 0.08 295)" }}>
            {format(weekStart, "d 'de' MMMM", { locale: es })} — {format(weekEnd, "d 'de' MMMM, yyyy", { locale: es })}
          </p>
          <div className="flex gap-3">
            <div className="rounded-xl px-4 py-2 text-[13px] font-semibold"
              style={{ backgroundColor: "oklch(0.28 0.05 295)", color: "oklch(0.85 0.10 295)" }}>
              {totalNotas} nota{totalNotas !== 1 ? "s" : ""} esta semana
            </div>
            <div className="rounded-xl px-4 py-2 text-[13px] font-semibold"
              style={{ backgroundColor: "oklch(0.28 0.05 295)", color: "oklch(0.85 0.10 295)" }}>
              {totalPersonas} compañero{totalPersonas !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      <main className="px-6 py-8 max-w-4xl mx-auto w-full flex-1">
        {!loading && enLicencia.length > 0 && (
          <div className="rounded-2xl px-5 py-3.5 mb-4"
            style={{ backgroundColor: "oklch(0.65 0.14 330 / 0.10)", border: "1px solid oklch(0.65 0.14 330 / 0.35)" }}>
            <p className="text-[12px] font-semibold text-foreground mb-2">🍼 En licencia — no requieren bitácora</p>
            <div className="flex flex-wrap gap-2">
              {enLicencia.map(c => (
                <button key={c.id} onClick={() => navigate(`/colleague/${c.id}`)}
                  className="text-[12px] px-2.5 py-1 rounded-full bg-card border border-border text-foreground hover:opacity-80 transition-opacity">
                  {c.nombre} <span className="text-muted-foreground">· {c.licencia.tipo}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <p className="text-muted-foreground text-[13px]">Cargando…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-24 text-muted-foreground animate-fade-up">
            <p className="text-[15px] font-semibold text-foreground mb-1">Sin notas esta semana</p>
            <p className="text-[13px]">Ve al perfil de un compañero y agrega una nota.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([colleagueId, data]) => {
              const h = hashHue(colleagueId)
              return (
                <div key={colleagueId} className="bg-card border border-border rounded-2xl overflow-hidden"
                  style={{ borderLeftColor: `oklch(0.60 0.18 ${h})`, borderLeftWidth: "3px" }}>

                  {/* Colleague header */}
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/colleague/${colleagueId}`)}>
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-[13px]"
                      style={{ background: `linear-gradient(135deg, oklch(0.68 0.18 ${h}), oklch(0.54 0.22 ${(h + 40) % 360}))` }}>
                      {data.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] text-foreground">{data.name}</p>
                      {colleagueMap[colleagueId]?.area && (
                        <p className="text-[11px] text-muted-foreground">{colleagueMap[colleagueId].area}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `oklch(0.60 0.18 ${h} / 0.12)`, color: `oklch(0.48 0.18 ${h})` }}>
                      {data.logs.length} nota{data.logs.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Notes */}
                  <div className="divide-y divide-border">
                    {data.logs.map(log => (
                      <div key={log.id} className="px-5 py-3.5 group">
                        <div className="flex gap-3 items-start">
                          <div className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0"
                            style={{ backgroundColor: `oklch(0.60 0.16 ${h})` }} />
                          <div className="flex-1 min-w-0">
                            {editingId === log.id ? (
                              <div className="space-y-2">
                                <textarea value={editingText} onChange={e => setEditingText(e.target.value)}
                                  rows={3}
                                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                                <div className="flex gap-2">
                                  <button onClick={() => handleSaveEdit(log.id)}
                                    className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg text-white"
                                    style={{ backgroundColor: `oklch(0.55 0.16 ${h})` }}>
                                    Guardar
                                  </button>
                                  <button onClick={() => setEditingId(null)}
                                    className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-[14px] text-foreground leading-relaxed">{log.nota}</p>
                                <div className="flex justify-between items-center mt-1.5">
                                  <p className="text-[11px] text-muted-foreground capitalize">
                                    {log.createdAt?.toDate ? format(log.createdAt.toDate(), "EEEE d 'de' MMMM", { locale: es }) : ""}
                                  </p>
                                  {log.creadoPor === user?.uid && (
                                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => { setEditingId(log.id); setEditingText(log.nota) }}
                                        className="text-[12px] font-medium hover:opacity-70 transition-opacity"
                                        style={{ color: `oklch(0.60 0.14 ${h})` }}>
                                        Editar
                                      </button>
                                      <button onClick={() => handleDeleteLog(log.id)}
                                        className="text-[12px] text-destructive hover:opacity-70 transition-opacity">
                                        Eliminar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
