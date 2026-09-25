import { useEffect, useState, useMemo, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { getSemilleros } from "@/services/semilleros.service"
import { getColleagues } from "@/services/colleagues.service"
import { getAllLogs, deleteLog } from "@/services/logs.service"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { MetricsDashboard } from "@/components/ui/MetricsDashboard"
import { NotificationBell } from "@/components/ui/NotificationBell"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Users, Briefcase, Layers, ArrowRight, LogOut,
  Home, TrendingUp, BarChart2, Menu, Settings,
  ChevronRight, ChevronDown, Activity, User, Trash2
} from "lucide-react"
import GestionarUsuarios from "@/pages/GestionarUsuarios"


function StatCard({ label, value, sub, hue = "165" }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="text-[28px] font-black text-foreground leading-none">{value}</p>
      <p className="text-[13px] text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function GlobalDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, logout, isSuperAdmin, isAdmin, mySemilleroId, myColleagueId } = useAuth()

  const [semilleros, setSemilleros] = useState([])
  const [colleagues, setColleagues] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  // Tab persiste en la URL (?tab=...) para que "atrás" restaure la pestaña correcta
  const tab = searchParams.get("tab") || "resumen"
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [expandedLogId, setExpandedLogId] = useState(null)
  const [logFilter,  setLogFilter]  = useState(null)
  const [logSearch,  setLogSearch]  = useState("")
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  const getThisWeekRange = () => {
    const now = new Date()
    const day = now.getDay()
    const diffMon = day === 0 ? -6 : 1 - day
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffMon)
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
    return {
      from: mon.toISOString().split("T")[0],
      to:   sun.toISOString().split("T")[0],
    }
  }
  const [dateFrom, setDateFrom] = useState(() => getThisWeekRange().from)
  const [dateTo,   setDateTo]   = useState(() => getThisWeekRange().to)

  useEffect(() => {
    if (!isAdmin) { navigate("/semilleros", { replace: true }); return }
    // Los admins (no superadmin) van directo a la pestaña de usuarios
    if (!isSuperAdmin) setTab("usuarios")
    Promise.all([getSemilleros(), getColleagues(), getAllLogs()])
      .then(([sems, cols, ls]) => {
        setSemilleros(sems)
        setColleagues(cols)
        setLogs(ls)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isSuperAdmin, navigate])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handler = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Stats globales
  const semStats = semilleros.map(s => {
    const members = colleagues.filter(c => c.semilleroId === s.id)
    const proyectos = members.reduce((acc, c) => acc + (c.proyectos?.length || 0), 0)
    const herramientas = members.reduce((acc, c) => acc + (c.herramientas?.length || 0), 0)
    const withProjects = members.filter(c => c.proyectos?.length > 0).length
    return { ...s, memberCount: members.length, proyectos, herramientas, withProjects }
  })

  const totalPersonas = colleagues.length
  const totalProyectos = colleagues.reduce((acc, c) => acc + (c.proyectos?.length || 0), 0)
  const totalHerramientas = new Set(colleagues.flatMap(c => c.herramientas || [])).size
  const sinEquipo = colleagues.filter(c => !c.semilleroId).length

  const userInitial = user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?"
  const userFirstName = (user?.displayName || user?.email?.split("@")[0] || "Usuario").split(" ")[0]

  // Buscar el perfil real por uid (evita duplicados por email); fallback a myColleagueId
  const myCompanion = colleagues.find(c => c.uid === user?.uid)
    || (myColleagueId ? colleagues.find(c => c.id === myColleagueId) : null)
  const profileColleagueId = myCompanion?.id || myColleagueId
  const profileSemilleroId = mySemilleroId || myCompanion?.semilleroId

  const weekLogs = useMemo(() => {
    const toDate = ts => ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : null)
    const start = dateFrom ? new Date(dateFrom + "T00:00:00") : null
    const end   = dateTo   ? new Date(dateTo   + "T23:59:59") : null
    return logs
      .filter(log => {
        const d = toDate(log.createdAt)
        if (!d) return false
        if (start && d < start) return false
        if (end   && d > end)   return false
        if (logFilter && log.semilleroId !== logFilter) return false
        if (logSearch) {
          const q = logSearch.toLowerCase()
          const semNombre = semilleros.find(s => s.id === log.semilleroId)?.nombre?.toLowerCase() || ""
          const matchName = log.colleagueName?.toLowerCase().includes(q)
          const matchSem  = semNombre.includes(q)
          const matchNota = log.nota?.toLowerCase().includes(q)
          if (!matchName && !matchSem && !matchNota) return false
        }
        return true
      })
      .sort((a, b) => {
        const da = toDate(a.createdAt) || 0
        const db = toDate(b.createdAt) || 0
        return db - da
      })
  }, [logs, dateFrom, dateTo, logFilter, logSearch, semilleros])

  const navItems = [
    ...(isSuperAdmin ? [
      { key: "resumen",   label: "Resumen",   icon: Home },
      { key: "analisis",  label: "Análisis",  icon: TrendingUp },
      { key: "proyectos", label: "Actividades", icon: Briefcase },
    ] : []),
    { key: "usuarios", label: "Usuarios", icon: Settings },
  ]

  // ── Proyectos por equipo ──────────────────────────────────────────────────
  const [projSearch, setProjSearch] = useState("")
  const [projEstado, setProjEstado] = useState("Todos")
  const [expandedSems, setExpandedSems] = useState(() => new Set())
  const [showScrollTop, setShowScrollTop] = useState(false)
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 250)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])
  const toggleSem = id => setExpandedSems(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const proyPorEquipo = useMemo(() => {
    return semilleros.map(sem => {
      const miembros = colleagues.filter(c => c.semilleroId === sem.id)
      const proyectos = miembros.flatMap(c =>
        (c.proyectos || []).map(p => ({ ...p, _colega: c.nombre, _coleagueId: c.id }))
      )
      return { sem, proyectos }
    }).filter(({ proyectos }) => proyectos.length > 0)
  }, [semilleros, colleagues])

  const proyFiltrados = useMemo(() => {
    const q = projSearch.trim().toLowerCase()
    return proyPorEquipo.map(({ sem, proyectos }) => {
      const filtrados = proyectos.filter(p => {
        if (projEstado !== "Todos" && p.estado !== projEstado) return false
        if (q && !p.nombre?.toLowerCase().includes(q) && !p._colega?.toLowerCase().includes(q)) return false
        return true
      })
      return { sem, proyectos: filtrados }
    }).filter(({ proyectos }) => proyectos.length > 0)
  }, [proyPorEquipo, projSearch, projEstado])

  const ESTADOS_PROJ = ["Todos", "Formulación", "En ejecución", "En evaluación", "Finalizado", "Suspendido"]
  // color-mix con variables CSS del tema → funciona en modo claro Y oscuro automáticamente
  const ESTADO_COLOR = {
    "Formulación":   { bg: "color-mix(in oklch, oklch(0.55 0.18 260), var(--card) 82%)", text: "color-mix(in oklch, oklch(0.55 0.18 260), var(--foreground) 32%)" },
    "En ejecución":  { bg: "color-mix(in oklch, oklch(0.52 0.15 165), var(--card) 82%)", text: "color-mix(in oklch, oklch(0.52 0.15 165), var(--foreground) 32%)" },
    "En evaluación": { bg: "color-mix(in oklch, oklch(0.68 0.18 75),  var(--card) 82%)", text: "color-mix(in oklch, oklch(0.68 0.18 75),  var(--foreground) 32%)" },
    "Finalizado":    { bg: "color-mix(in oklch, oklch(0.55 0.04 165), var(--card) 82%)", text: "color-mix(in oklch, oklch(0.55 0.04 165), var(--foreground) 32%)" },
    "Suspendido":    { bg: "color-mix(in oklch, oklch(0.57 0.22 27),  var(--card) 82%)", text: "color-mix(in oklch, oklch(0.57 0.22 27),  var(--foreground) 32%)" },
  }

  // ── SIDEBAR ──────────────────────────────────────────────────────────────
  const Sidebar = (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-border/50
        transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ width: 228, background: "var(--sidebar)" }}>

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[15px] font-black flex-shrink-0"
          style={{
            background: "linear-gradient(140deg, oklch(0.52 0.13 165), oklch(0.42 0.14 185))",
            boxShadow: "0 4px 14px oklch(0.52 0.13 165 / 40%)",
          }}>
          W
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-foreground leading-none">Workboard</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-none truncate">Vista global</p>
        </div>
      </div>

      <div className="mx-4 h-px bg-border/70 flex-shrink-0" />

      {/* User card */}
      <div className="px-4 py-4 flex-shrink-0">
        <div
          className={`flex items-center gap-2.5 px-3 py-3 rounded-xl transition-colors${profileColleagueId && profileSemilleroId ? " cursor-pointer hover:bg-[oklch(0.52_0.13_165_/_0.14)]" : ""}`}
          style={{ background: "oklch(0.52 0.13 165 / 0.08)" }}
          onClick={() => profileColleagueId && profileSemilleroId && navigate(`/semillero/${profileSemilleroId}/colleague/${profileColleagueId}`)}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.42 0.14 185))" }}>
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground truncate leading-snug">{userFirstName}</p>
            <p className="text-[10px] truncate leading-snug" style={{ color: "oklch(0.52 0.13 165)" }}>
              {isSuperAdmin ? "Super Admin" : isAdmin ? "Coordinador" : "Miembro"}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">

        {/* Sección principal */}
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-2">
          General
        </p>
        {navItems.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key}
              onClick={() => { setTab(t.key); setSidebarOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left"
              style={active ? {
                background: "var(--primary)",
                color: "oklch(1 0 0)",
                boxShadow: "0 4px 18px oklch(0.52 0.13 165 / 30%)",
              } : { color: "var(--muted-foreground)" }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--muted)" }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "" }}>
              <Icon size={16} className="flex-shrink-0" />
              {t.label}
            </button>
          )
        })}

        {/* Coordinaciones */}
        <div className="pt-3 pb-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-3">
            Coordinaciones
          </p>
        </div>
        <button
          onClick={() => { navigate("/semilleros?manage=true"); setSidebarOpen(false) }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all text-left"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--muted)"}
          onMouseLeave={e => e.currentTarget.style.background = ""}>
          <Settings size={13} className="flex-shrink-0" />
          Gestionar coordinaciones
        </button>
      </nav>

      <div className="mx-4 h-px bg-border/70 flex-shrink-0" />

      {/* Bottom */}
      <div className="px-3 py-4 space-y-0.5 flex-shrink-0">
        {profileColleagueId && profileSemilleroId && (
          <button
            onClick={() => navigate(`/semillero/${profileSemilleroId}/colleague/${profileColleagueId}`)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors hover:bg-muted text-left text-foreground">
            <User size={16} className="flex-shrink-0 text-muted-foreground" />
            Mi perfil
          </button>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors hover:bg-muted text-left"
          style={{ color: "var(--destructive)" }}>
          <LogOut size={16} className="flex-shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-background flex">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "oklch(0 0 0 / 45%)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {Sidebar}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <style>{`@media (min-width: 1024px) { .main-offset { margin-left: 228px; } }`}</style>
        <div className="main-offset flex flex-col min-h-screen flex-1">

          {/* Top bar */}
          <header className="sticky top-0 z-20 h-14 border-b border-border/60 px-5 flex items-center gap-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>
            <button
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              onClick={() => setSidebarOpen(v => !v)}>
              <Menu size={16} className="text-muted-foreground" />
            </button>
            <div className="hidden lg:flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">Workboard</span>
              <span className="text-[12px] text-muted-foreground">/</span>
              <span className="text-[13px] font-semibold text-foreground">
                {tab === "resumen" ? "Resumen global" : tab === "analisis" ? "Análisis global" : tab === "proyectos" ? "Todas las actividades" : "Gestionar usuarios"}
              </span>
            </div>
            <span className="lg:hidden text-[14px] font-semibold text-foreground">
              {tab === "resumen" ? "Resumen global" : tab === "analisis" ? "Análisis global" : tab === "proyectos" ? "Todas las actividades" : "Gestionar usuarios"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell
                isAdmin={true}
                userEmail={user?.email}
                userUid={user?.uid}
                semilleroId={isSuperAdmin ? undefined : mySemilleroId}
              />
              <ThemeToggle />
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-6 space-y-6 overflow-y-auto">

            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center space-y-3">
                  <BarChart2 size={28} className="mx-auto text-muted-foreground opacity-30" />
                  <p className="text-[13px] text-muted-foreground">Cargando datos…</p>
                </div>
              </div>
            ) : tab === "resumen" ? (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Equipos activos" value={semilleros.length} hue="165" />
                  <StatCard label="Total de personas" value={totalPersonas}
                    sub={`${sinEquipo} sin equipo asignado`} hue="230" />
                  <StatCard label="Actividades en total" value={totalProyectos}
                    sub={`~${semilleros.length ? (totalProyectos / semilleros.length).toFixed(1) : 0} por equipo`} hue="295" />
                  <StatCard label="Herramientas distintas" value={totalHerramientas} hue="40" />
                </div>

                {/* Equipos breakdown */}
                <section>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                    Desglose por equipo
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {semStats.map(s => {
                      const h = s.color || "165"
                      const pct = s.memberCount > 0
                        ? Math.round((s.withProjects / s.memberCount) * 100) : 0
                      return (
                        <div key={s.id}
                          className="bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => navigate(`/semillero/${s.id}/dashboard`)}>
                          <div className="h-[3px] w-full"
                            style={{ background: `linear-gradient(90deg, oklch(0.62 0.18 ${h}), oklch(0.55 0.18 ${(Number(h) + 40) % 360} / 0.4))` }} />
                          <div className="p-5">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ background: `oklch(0.62 0.18 ${h} / 0.15)` }}>
                                  <Layers size={15} style={{ color: `oklch(0.58 0.18 ${h})` }} />
                                </div>
                                <div>
                                  <p className="text-[14px] font-semibold text-foreground">{s.nombre}</p>
                                  {s.descripcion && (
                                    <p className="text-[11px] text-muted-foreground line-clamp-1">{s.descripcion}</p>
                                  )}
                                </div>
                              </div>
                              <ArrowRight size={14} className="text-muted-foreground" />
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              {[
                                { label: "Personas", value: s.memberCount },
                                { label: "Actividades", value: s.proyectos },
                                { label: "Herramientas", value: s.herramientas },
                              ].map(st => (
                                <div key={st.label} className="text-center py-2 rounded-xl"
                                  style={{ background: `oklch(0.62 0.18 ${h} / 0.07)` }}>
                                  <p className="text-[18px] font-bold text-foreground leading-none">{st.value}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{st.label}</p>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div className="flex justify-between mb-1">
                                <p className="text-[11px] text-muted-foreground">Con actividades activas</p>
                                <p className="text-[11px] font-semibold text-foreground">{pct}%</p>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    background: `linear-gradient(90deg, oklch(0.62 0.18 ${h}), oklch(0.55 0.18 ${(Number(h) + 40) % 360}))`,
                                  }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                {/* Actividad semanal */}
                <section>
                  {/* Fila 1: título + contador + selector de fechas */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      Actividad semanal
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {weekLogs.length} nota{weekLogs.length !== 1 ? "s" : ""}
                      </span>
                      <div className="flex items-center rounded-xl border border-border overflow-hidden text-[12px]"
                        style={{ background: "var(--card)" }}>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-r border-border">
                          <span className="text-[10px] font-semibold text-muted-foreground select-none">Desde</span>
                          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="bg-transparent text-[12px] text-foreground focus:outline-none cursor-pointer"
                            style={{ colorScheme: "dark light" }} />
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                          <span className="text-[10px] font-semibold text-muted-foreground select-none">Hasta</span>
                          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="bg-transparent text-[12px] text-foreground focus:outline-none cursor-pointer"
                            style={{ colorScheme: "dark light" }} />
                        </div>
                      </div>
                      <button
                        onClick={() => { const r = getThisWeekRange(); setDateFrom(r.from); setDateTo(r.to) }}
                        className="px-2.5 py-1.5 rounded-xl border border-border text-[11px] font-medium hover:bg-muted transition-colors"
                        style={{ color: "var(--muted-foreground)" }}>
                        Esta semana
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: búsqueda */}
                  <div className="relative mb-3">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)}
                      placeholder="Buscar por persona, equipo o actividad…"
                      className="w-full pl-8 pr-4 py-2 rounded-xl border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none" />
                    {logSearch && (
                      <button onClick={() => setLogSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-[14px]">
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Fila 3: filtro por equipo — dropdown */}
                  <div className="relative mb-4" ref={filterRef}>
                    <button onClick={() => setFilterOpen(v => !v)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border text-[12px] font-medium hover:bg-muted transition-colors"
                      style={{ color: logFilter ? "oklch(0.40 0.13 165)" : "var(--muted-foreground)", borderColor: logFilter ? "oklch(0.52 0.13 165 / 0.4)" : "var(--border)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                      </svg>
                      {logFilter ? semilleros.find(s => s.id === logFilter)?.nombre || "Equipo" : "Todos los equipos"}
                      <ChevronDown size={12} style={{ transform: filterOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                    </button>

                    {filterOpen && (
                      <div className="absolute left-0 top-[calc(100%+6px)] z-30 bg-card border border-border rounded-2xl shadow-xl overflow-hidden min-w-[200px]">
                        <button onClick={() => { setLogFilter(null); setFilterOpen(false) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-muted transition-colors text-left"
                          style={{ color: !logFilter ? "oklch(0.40 0.13 165)" : "var(--foreground)", fontWeight: !logFilter ? 700 : 400 }}>
                          {!logFilter && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "oklch(0.52 0.13 165)" }} />}
                          {logFilter && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-0" />}
                          Todos los equipos
                        </button>
                        <div className="border-t border-border/50" />
                        {semilleros.map(s => {
                          const h = s.color || "165"
                          const active = logFilter === s.id
                          return (
                            <button key={s.id} onClick={() => { setLogFilter(active ? null : s.id); setFilterOpen(false) }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-muted transition-colors text-left"
                              style={{ color: active ? `oklch(0.45 0.18 ${h})` : "var(--foreground)", fontWeight: active ? 700 : 400 }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: active ? `oklch(0.62 0.18 ${h})` : "var(--border)" }} />
                              {s.nombre}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    {weekLogs.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-[13px] text-muted-foreground">
                          Sin actividad registrada en ese período.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 440 }}>
                        {weekLogs.map((log, i) => {
                          const sem = semilleros.find(s => s.id === log.semilleroId)
                          const h = sem?.color || "165"
                          const isExpanded = expandedLogId === log.id
                          const logDate = log.createdAt?.toDate?.() || (log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000) : null)
                          const hasLongNote = (log.nota || "").length > 90
                          return (
                            <div key={log.id}
                              className={`group px-4 py-3 hover:bg-muted/30 transition-colors ${i < weekLogs.length - 1 ? "border-b border-border/50" : ""}`}>
                              <div className="flex items-center gap-3 cursor-pointer"
                                onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                                  style={{ background: `linear-gradient(135deg, oklch(0.62 0.18 ${h}), oklch(0.52 0.18 ${(Number(h) + 40) % 360}))` }}>
                                  {log.colleagueName?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                                <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                                  <span className="text-[13px] font-semibold text-foreground truncate shrink-0" style={{ maxWidth: 150 }}>
                                    {log.colleagueName || "—"}
                                  </span>
                                  {sem && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap flex-shrink-0"
                                      style={{ background: `oklch(0.62 0.18 ${h} / 0.12)`, color: `oklch(0.50 0.18 ${h})` }}>
                                      {sem.nombre}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {logDate && (
                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:block">
                                      {format(logDate, "EEEE d MMM · HH:mm", { locale: es })}
                                    </span>
                                  )}
                                  <button
                                    onClick={async e => {
                                      e.stopPropagation()
                                      if (!confirm("¿Eliminar esta nota de actividad?")) return
                                      await deleteLog(log.id).catch(() => {})
                                      setLogs(prev => prev.filter(l => l.id !== log.id))
                                    }}
                                    className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10"
                                    title="Eliminar nota"
                                    style={{ color: "var(--destructive)" }}>
                                    <Trash2 size={11} />
                                  </button>
                                  <ChevronDown size={13} className="text-muted-foreground"
                                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                                </div>
                              </div>
                              <div className="mt-1.5 pl-10">
                                <p className="text-[12px] text-muted-foreground break-words leading-relaxed"
                                  style={{ display: "-webkit-box", WebkitLineClamp: isExpanded ? "unset" : 2, WebkitBoxOrient: "vertical", overflow: isExpanded ? "visible" : "hidden" }}>
                                  {log.nota}
                                </p>
                                {hasLongNote && (
                                  <button className="text-[11px] font-medium mt-1 transition-colors hover:opacity-70"
                                    style={{ color: "oklch(0.52 0.13 165)" }}
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                                    {isExpanded ? "Ver menos" : "Ver más"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </>
            ) : tab === "analisis" ? (
              <MetricsDashboard colleagues={colleagues} logs={logs} />
            ) : tab === "proyectos" ? (
              <div className="space-y-6">
                {/* Resumen numérico */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total actividades", value: colleagues.flatMap(c => c.proyectos || []).length },
                    { label: "En ejecución",    value: colleagues.flatMap(c => c.proyectos || []).filter(p => p.estado === "En ejecución").length },
                    { label: "Finalizados",     value: colleagues.flatMap(c => c.proyectos || []).filter(p => p.estado === "Finalizado").length },
                    { label: "Equipos activos", value: proyPorEquipo.length },
                  ].map(stat => (
                    <div key={stat.label} className="rounded-2xl border border-border p-4" style={{ background: "var(--card)" }}>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</p>
                      <p className="text-[26px] font-black text-foreground leading-none">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    placeholder="Buscar actividad o persona…"
                    value={projSearch}
                    onChange={e => setProjSearch(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 min-w-[220px]"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {ESTADOS_PROJ.map(e => (
                      <button key={e} onClick={() => setProjEstado(e)}
                        className="h-8 px-3 rounded-xl text-[12px] font-semibold border transition-all"
                        style={projEstado === e
                          ? { background: "oklch(0.52 0.13 165)", color: "white", borderColor: "transparent" }
                          : { background: "var(--card)", color: "var(--muted-foreground)", borderColor: "var(--border)" }}>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botón volver arriba */}
                {showScrollTop && (
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
                    style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.42 0.14 185))", color: "white" }}
                    title="Volver arriba">
                    <ChevronDown size={18} style={{ transform: "rotate(180deg)" }} />
                  </button>
                )}

                {/* Equipos en acordeón */}
                {proyFiltrados.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground py-8 text-center">Sin resultados.</p>
                ) : (
                  <div className="space-y-3">
                    {proyFiltrados.map(({ sem, proyectos }) => {
                      const isOpen = expandedSems.has(sem.id)
                      const hue = sem.color || 165
                      return (
                        <div key={sem.id} className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--card)" }}>
                          {/* Cabecera clicable */}
                          <button
                            onClick={() => toggleSem(sem.id)}
                            className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:brightness-95"
                            style={{ background: `oklch(0.52 0.13 ${hue} / 0.06)` }}>
                            <div className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ background: `oklch(0.52 0.13 ${hue})` }} />
                            <p className="text-[14px] font-bold text-foreground flex-1">{sem.nombre}</p>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full mr-2"
                              style={{
                                background: `color-mix(in oklch, oklch(0.52 0.13 ${hue}), var(--card) 82%)`,
                                color: `color-mix(in oklch, oklch(0.52 0.13 ${hue}), var(--foreground) 32%)`,
                              }}>
                              {proyectos.length} {proyectos.length === 1 ? "actividad" : "actividades"}
                            </span>
                            <ChevronDown size={16} className="text-muted-foreground flex-shrink-0 transition-transform duration-200"
                              style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                          </button>

                          {/* Lista de proyectos (colapsable) */}
                          {isOpen && (
                            <div className="divide-y divide-border border-t border-border">
                              {proyectos.map((p, i) => {
                                const ec = ESTADO_COLOR[p.estado] || ESTADO_COLOR["Formulación"]
                                const stored = p.avance ?? 0
                                const avance = stored > 0 ? stored
                                  : p.estado === "Finalizado"   ? 100
                                  : p.estado === "En evaluación" ? 75
                                  : p.estado === "En ejecución"  ? 40
                                  : p.estado === "Formulación"   ? 10
                                  : stored
                                const isInferred = stored === 0 && avance !== 0
                                return (
                                  <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/40 transition-colors">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                          onClick={() => navigate(`/semillero/${sem.id}/colleague/${p._coleagueId}`, { state: { openProjectEdit: p.nombre } })}
                                          className="text-[13px] font-semibold text-left truncate hover:underline transition-all"
                                          style={{ color: `color-mix(in oklch, oklch(0.55 0.15 ${hue}), var(--foreground) 28%)` }}>
                                          {p.nombre}
                                        </button>
                                        {p.estado && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                            style={{ background: ec.bg, color: ec.text }}>
                                            {p.estado}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p._colega}</p>
                                      {p.area && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{p.area}</p>}
                                    </div>
                                    {/* Barra de avance */}
                                    <div className="flex-shrink-0 w-24 space-y-1 text-right">
                                      <p className="text-[11px] font-bold text-foreground">
                                        {avance}%{isInferred && <span className="text-[9px] font-normal text-muted-foreground ml-0.5">~</span>}
                                      </p>
                                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                                        <div className="h-full rounded-full transition-all"
                                          style={{ width: `${avance}%`, background: `oklch(0.52 0.13 ${hue})` }} />
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <GestionarUsuarios semilleros={semilleros} />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
