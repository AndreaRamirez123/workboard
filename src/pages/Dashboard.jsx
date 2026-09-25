import { useEffect, useState, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth, DIRECTIVOS } from "@/context/AuthContext"
import { getColleaguesBySemillero, bulkCreateColleagues, deleteColleague } from "@/services/colleagues.service"
import { getSemillero, updateSemillero } from "@/services/semilleros.service"
import { parseColleaguesFile } from "@/utils/parseColleaguesFile"
import { getAllLogs } from "@/services/logs.service"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { Footer } from "@/components/ui/Footer"
import {
  UserCircle, Search, Users, Plus, Pencil, Trash2, X, Upload,
  LayoutGrid, LayoutList, MoreHorizontal, Briefcase, Wrench,
  LogOut, HelpCircle, Copy, ExternalLink, TrendingUp, Menu, Home, CheckSquare
} from "lucide-react"
import { NotificationBell } from "@/components/ui/NotificationBell"
import { Tutorial, resetTutorial } from "@/components/ui/Tutorial"
import { MetricsDashboard } from "@/components/ui/MetricsDashboard"
import { TeamDashboard } from "@/components/ui/TeamDashboard"
import { getEquiposBySemillero, createEquipo, updateEquipo, deleteEquipo } from "@/services/equipos.service"
import { queueGrupoNotification, queueParticipanteGrupoNotification } from "@/services/wpp.service"
import { crearNotificacionUsuario } from "@/services/notificaciones.service"
import { importGroupContacts, getGroupContactsCount, getGrupoTasks } from "@/services/groups.service"
import { getTasks } from "@/services/tasks.service"
import { getAdminsBySemillero } from "@/services/usuarios.service"
import { parseContactsFile } from "@/utils/parseContactsFile"


function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h * 137.508) % 360
}

function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  const lr = lin(r), lg = lin(g), lb = lin(b)
  const lv = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const mv = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const sv = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const a = 1.9779984951 * lv - 2.4285922050 * mv + 0.4505937099 * sv
  const bv = 0.0259040371 * lv + 0.7827717662 * mv - 0.8086757660 * sv
  let hue = Math.atan2(bv, a) * 180 / Math.PI
  if (hue < 0) hue += 360
  return String(Math.round(hue))
}

function hueToHex(hue) {
  const h = ((parseInt(hue) % 360) + 360) % 360 / 360
  const s = 0.65, l = 0.57
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255).toString(16).padStart(2, "0")
  const g = Math.round(hue2rgb(p, q, h) * 255).toString(16).padStart(2, "0")
  const bv = Math.round(hue2rgb(p, q, h - 1 / 3) * 255).toString(16).padStart(2, "0")
  return `#${r}${g}${bv}`
}


function hexToRgb(hex) {
  if (!hex || hex.length < 7) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`
}

function calcWorkloadScore(proyectos = []) {
  let count = 0
  for (const p of proyectos) {
    const avance = p.avance ?? 0
    if (p.estado === "Finalizado" || p.estado === "Hecho" || p.estado === "Suspendido" || avance >= 100) continue
    count++
  }
  return count
}

function workloadRingColor(score) {
  if (score === 0) return "var(--border)"
  if (score === 1) return "oklch(0.52 0.13 165)"
  if (score === 2) return "oklch(0.75 0.15 80)"
  if (score === 3) return "oklch(0.65 0.20 40)"
  return "oklch(0.577 0.245 27.325)"
}

function workloadLabel(score) {
  if (score === 0) return "Libre"
  if (score === 1) return "Disponible"
  if (score === 2) return "Ocupado"
  if (score === 3) return "Carga alta"
  return "Sobrecarga"
}

function WorkloadRing({ count, size = 52, children }) {
  const r = (size / 2) - 4
  const circumference = 2 * Math.PI * r
  const ratio = Math.min(1, count / 4)  // count = workloadScore, 4 = sobrecarga
  const dashOffset = circumference * (1 - ratio)
  const color = workloadRingColor(count)
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={2.5} />
        {count > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.7s ease" }} />
        )}
      </svg>
      <div className="absolute rounded-full overflow-hidden"
        style={{ inset: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { semilleroId } = useParams()
  const { user, logout, myColleagueId, isSuperAdmin, isAdmin: ctxIsAdmin } = useAuth()

  const [semillero, setSemillero] = useState(null)

  // isAdmin = rol "admin"/"superadmin" en usuarios/{uid} OR coordinador asignado en semillero
  const isAdmin = ctxIsAdmin || (semillero?.coordinadores?.includes(user?.uid) ?? false)

  const [colleagues, setColleagues] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("equipo")
  const [logs, setLogs] = useState([])

  const [viewMode, setViewMode] = useState("grid")
  const [filterRole, setFilterRole] = useState(null)
  const [filterArea, setFilterArea] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openCardMenu, setOpenCardMenu] = useState(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [importColleaguesPreview, setImportColleaguesPreview] = useState(null)
  const [importColleaguesLoading, setImportColleaguesLoading] = useState(false)
  const [importColleaguesSaving, setImportColleaguesSaving] = useState(false)
  const [importColleaguesResult, setImportColleaguesResult] = useState(null)
  const [importColleaguesError, setImportColleaguesError] = useState("")
  const colleaguesFileRef = useRef(null)

  const [equipos, setEquipos] = useState([])
  const [equipoForm, setEquipoForm] = useState({ nombre: "", descripcion: "", color: "295", esPrueba: false })
  const [editingEquipoHex, setEditingEquipoHex] = useState(null)
  const [showEquipoForm, setShowEquipoForm] = useState(false)
  const [editingEquipo, setEditingEquipo] = useState(null)
  const [savingEquipo, setSavingEquipo] = useState(false)
  const [participantCounts, setParticipantCounts] = useState({})

  const contactsInputRef = useRef(null)
  const deadlineCheckDoneRef = useRef(false)
  const importingEquipoIdRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importingEquipoId, setImportingEquipoId] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState("")
  const [importSaving, setImportSaving] = useState(false)
  const [importSuccessCount, setImportSuccessCount] = useState(null)
  const [teamCoordUids, setTeamCoordUids] = useState([])
  const [showCoordPicker, setShowCoordPicker] = useState(false)
  const [savingCoord, setSavingCoord] = useState(false)

  useEffect(() => {
    if (!semilleroId) return
    getSemillero(semilleroId).then(s => setSemillero(s)).catch(() => {})
    getAdminsBySemillero(semilleroId).then(us => setTeamCoordUids(us.map(u => u.id))).catch(() => {})
  }, [semilleroId])

  useEffect(() => {
    if (!user || !semilleroId) return
    setLoadingData(true)
    Promise.all([getColleaguesBySemillero(semilleroId), getAllLogs(), getEquiposBySemillero(semilleroId).catch(() => [])]).then(([cols, ls, eqs]) => {
      setColleagues(cols)
      setLogs(ls)
      setEquipos(eqs)
      setLoadingData(false)
      if (isSuperAdmin) {
        Promise.all(eqs.map(eq => getGroupContactsCount(eq.id).then(n => [eq.id, n]).catch(() => [eq.id, 0])))
          .then(pairs => setParticipantCounts(Object.fromEntries(pairs)))
      }
    })
  }, [user, semilleroId])

  useEffect(() => {
    if (!openCardMenu) return
    const handler = () => setOpenCardMenu(null)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [openCardMenu])

  // Alerta 2 días antes del vencimiento de tareas individuales y de grupo
  useEffect(() => {
    if (!user?.uid || !myColleagueId || !semilleroId || loadingData || deadlineCheckDoneRef.current) return
    deadlineCheckDoneRef.current = true

    const today = new Date()
    const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
    const alertDate = toStr(today)
    const d1 = new Date(today); d1.setDate(today.getDate() + 1)
    const d2 = new Date(today); d2.setDate(today.getDate() + 2)
    // Mapa fecha → título de alerta (el cheque corre cada día, así que cada día aplica el título correspondiente)
    const ALERT_DATES = {
      [toStr(today)]: "¡Tarea vence hoy!",
      [toStr(d1)]:    "Tarea vence mañana",
      [toStr(d2)]:    "Tarea próxima a vencer",
    }
    const STORAGE_KEY = `wb_deadline_alerts_${user.uid}_${alertDate}`
    const alreadyNotified = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"))

    async function checkDeadlines() {
      const newKeys = []

      try {
        const tasks = await getTasks(myColleagueId)
        for (const t of tasks) {
          if (!t.fechaLimite || t.estado === "Hecho" || t.avance >= 100) continue
          if (!ALERT_DATES[t.fechaLimite]) continue
          const key = `ind_${t.id}`
          if (alreadyNotified.has(key)) continue
          await crearNotificacionUsuario({
            toUid: user.uid,
            tipo: "tarea_vencimiento",
            titulo: ALERT_DATES[t.fechaLimite],
            subtitulo: t.titulo,
            path: `/semillero/${semilleroId}/colleague/${myColleagueId}`,
            semilleroId,
          }).catch(() => {})
          newKeys.push(key)
        }
      } catch {}

      const myGrupos = equipos.filter(eq =>
        eq.memberUids?.includes(user.uid) || eq.miembros?.includes(myColleagueId)
      )
      for (const grupo of myGrupos) {
        try {
          const tasks = await getGrupoTasks(grupo.id)
          for (const t of tasks) {
            if (!t.fechaLimite || t.estado === "Hecho" || t.avance >= 100) continue
            if (!ALERT_DATES[t.fechaLimite]) continue
            const key = `grp_${grupo.id}_${t.id}`
            if (alreadyNotified.has(key)) continue
            await crearNotificacionUsuario({
              toUid: user.uid,
              tipo: "tarea_vencimiento",
              titulo: ALERT_DATES[t.fechaLimite],
              subtitulo: `${t.titulo} — ${grupo.nombre}`,
              path: `/semillero/${semilleroId}/grupo/${grupo.id}`,
              semilleroId,
            }).catch(() => {})
            newKeys.push(key)
          }
        } catch {}
      }

      if (newKeys.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...alreadyNotified, ...newKeys]))
      }
    }

    checkDeadlines()
  }, [user?.uid, myColleagueId, semilleroId, loadingData])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const reloadEquipos = () => getEquiposBySemillero(semilleroId).then(eqs => {
    setEquipos(eqs)
    if (isSuperAdmin) {
      Promise.all(eqs.map(eq => getGroupContactsCount(eq.id).then(n => [eq.id, n]).catch(() => [eq.id, 0])))
        .then(pairs => setParticipantCounts(Object.fromEntries(pairs)))
    }
  })

  const handleContactsFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImportError("")
    setImportLoading(true)
    try {
      const parsed = await parseContactsFile(file)
      setImportPreview(parsed)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  const handleConfirmImport = async () => {
    const equipoId = importingEquipoIdRef.current
    const total = importPreview?.length
    if (!total || !equipoId) {
      setImportError(`No se pudo obtener el ID del grupo (${equipoId || "vacío"}). Intenta de nuevo.`)
      return
    }
    setImportSaving(true)
    setImportError("")
    try {
      await importGroupContacts(equipoId, importPreview, user?.email)
      const grupo = equipos.find(e => e.id === equipoId)
      if (grupo && !grupo.esPrueba) {
        importPreview.forEach(contacto =>
          queueParticipanteGrupoNotification({ contacto, grupo }).catch(() => {})
        )
      }
      setImportSuccessCount(total)
      setImportPreview(null)
      setTimeout(() => {
        setImportingEquipoId(null)
        setImportSuccessCount(null)
        importingEquipoIdRef.current = null
      }, 2500)
    } catch (err) {
      console.error("Error importando contactos:", err)
      setImportError(`Error al guardar: ${err?.message || "permisos insuficientes. Verifica que estés como admin."}`)
    } finally {
      setImportSaving(false)
    }
  }

  const handleSaveEquipo = async () => {
    if (!equipoForm.nombre.trim()) return
    setSavingEquipo(true)
    try {
      if (editingEquipo) {
        await updateEquipo(editingEquipo.id, {
          nombre: equipoForm.nombre.trim(),
          descripcion: equipoForm.descripcion.trim(),
          color: equipoForm.color,
          esPrueba: !!equipoForm.esPrueba,
        })
      } else {
        await createEquipo({
          nombre: equipoForm.nombre.trim(),
          descripcion: equipoForm.descripcion.trim(),
          color: equipoForm.color,
          esPrueba: !!equipoForm.esPrueba,
          miembros: myColleagueId ? [myColleagueId] : [],
          memberUids: user?.uid ? [user.uid] : [],
          semilleroId,
        })
      }
      await reloadEquipos()
      setShowEquipoForm(false)
      setEditingEquipo(null)
      setEquipoForm({ nombre: "", descripcion: "", color: "295", esPrueba: false })
    } catch (e) {
      console.error("Error guardando equipo:", e)
    } finally {
      setSavingEquipo(false)
    }
  }

  const handleDeleteEquipo = async (id) => {
    try { await deleteEquipo(id) } catch (e) { console.error(e) }
    reloadEquipos().catch(() => {})
  }

  const handleToggleMember = async (equipoId, colleagueId) => {
    const eq = equipos.find(e => e.id === equipoId)
    if (!eq) return
    const miembros = eq.miembros || []
    const memberUids = eq.memberUids || []
    const colleague = colleagues.find(c => c.id === colleagueId)
    const adding = !miembros.includes(colleagueId)
    const updatedMiembros = adding ? [...miembros, colleagueId] : miembros.filter(m => m !== colleagueId)
    const uid = colleague?.uid
    const updatedUids = uid
      ? (adding ? [...memberUids, uid] : memberUids.filter(u => u !== uid))
      : memberUids
    try {
      await updateEquipo(equipoId, { miembros: updatedMiembros, memberUids: updatedUids })
      if (adding && colleague?.whatsapp) {
        queueGrupoNotification({ colleague, grupo: eq }).catch(() => {})
      }
      if (adding && uid) {
        crearNotificacionUsuario({
          toUid: uid,
          tipo: "invitado_grupo",
          titulo: "Te han invitado a un grupo",
          subtitulo: eq.nombre,
          path: `/semillero/${semilleroId}/grupo/${equipoId}`,
          semilleroId,
        }).catch(() => {})
      }
    } catch (e) { console.error(e) }
    reloadEquipos().catch(() => {})
  }

  const handleColleaguesFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImportColleaguesError("")
    setImportColleaguesLoading(true)
    try {
      const parsed = await parseColleaguesFile(file)
      setImportColleaguesPreview(parsed)
    } catch (err) {
      setImportColleaguesError(err.message)
    } finally {
      setImportColleaguesLoading(false)
    }
  }

  const handleConfirmImportColleagues = async () => {
    if (!importColleaguesPreview?.length) return
    setImportColleaguesSaving(true)
    setImportColleaguesError("")
    try {
      const { ok, fail } = await bulkCreateColleagues(importColleaguesPreview, semilleroId, user?.uid)
      setImportColleaguesResult({ ok, fail })
      setImportColleaguesPreview(null)
      const refreshed = await getColleaguesBySemillero(semilleroId)
      setColleagues(refreshed)
    } catch (err) {
      setImportColleaguesError(`Error al guardar: ${err?.message || "permisos insuficientes"}`)
    } finally {
      setImportColleaguesSaving(false)
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const colleagueEquipoMap = {}
  equipos.forEach(eq => (eq.miembros || []).forEach(cid => { colleagueEquipoMap[cid] = eq }))

  const COLORS = ["295", "260", "145", "55", "27", "316", "180", "220"]

  const totalProjects = colleagues.reduce((sum, c) => sum + (c.proyectos?.length || 0), 0)
  const totalTools = new Set(colleagues.flatMap(c => c.herramientas || [])).size
  const colleaguesWithProjects = colleagues.filter(c => (c.proyectos?.length || 0) > 0).length

  const allAvances = colleagues.flatMap(c => (c.proyectos || []).map(p => p.avance ?? 0))
  const avgProgress = allAvances.length
    ? Math.round(allAvances.reduce((a, b) => a + b, 0) / allAvances.length)
    : 0

  const toolCounts = {}
  colleagues.forEach(c => (c.herramientas || []).forEach(t => { toolCounts[t] = (toolCounts[t] || 0) + 1 }))
  const topTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const allRoles = [...new Set(colleagues.map(c => c.rol).filter(Boolean))]
  const allAreas = [...new Set(colleagues.map(c => c.area).filter(Boolean))]

  const filtered = colleagues
    .filter(c => {
      const q = search.toLowerCase()
      const matchesSearch = !q ||
        c.nombre?.toLowerCase().includes(q) ||
        c.rol?.toLowerCase().includes(q) ||
        c.herramientas?.some(t => t.toLowerCase().includes(q)) ||
        c.area?.toLowerCase().includes(q)
      const matchesRole = !filterRole || c.rol === filterRole
      const matchesArea = !filterArea || c.area === filterArea
      return matchesSearch && matchesRole && matchesArea
    })
    .sort((a, b) => {
      const aIsMe = a.id === myColleagueId || (user?.uid && a.uid === user.uid) || (user?.email && a.email?.toLowerCase() === user.email.toLowerCase())
      const bIsMe = b.id === myColleagueId || (user?.uid && b.uid === user.uid) || (user?.email && b.email?.toLowerCase() === user.email.toLowerCase())
      return (bIsMe ? 1 : 0) - (aIsMe ? 1 : 0)
    })

  const userInitial = user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?"
  const userName = user?.displayName || user?.email?.split("@")[0] || "Usuario"
  const userFirstName = userName.split(" ")[0]

  const eqHex = hueToHex(parseInt(equipoForm.color) || 295)
  const eqRgb = hexToRgb(eqHex)

  const navItems = [
    ...(isAdmin ? [{ key: "resumen", label: "Resumen", icon: Home }] : []),
    { key: "equipo", label: "Mi equipo", icon: UserCircle },
    { key: "equipos", label: "Grupos", icon: Users },
    ...(isAdmin ? [{ key: "metricas", label: "Análisis", icon: TrendingUp }] : []),
  ]

  const pageTitle = {
    resumen: "Resumen del equipo",
    equipo: "Mi equipo",
    equipos: "Grupos",
    metricas: "Análisis & Reportes",
  }[tab]

  // ── SIDEBAR ───────────────────────────────────────────────────────────────
  const Sidebar = (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-border/50
        transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ width: 228, background: "var(--sidebar)" }}>

      {/* Logo */}
      <button
        className="px-5 pt-6 pb-5 flex items-center gap-3 flex-shrink-0 w-full text-left hover:opacity-80 transition-opacity"
        onClick={() => navigate(isSuperAdmin ? "/overview" : `/semillero/${semilleroId}/dashboard`)}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[15px] font-black flex-shrink-0"
          style={{
            background: "linear-gradient(140deg, oklch(0.52 0.13 165), oklch(0.42 0.14 185))",
            boxShadow: "0 4px 14px oklch(0.52 0.13 165 / 40%)",
          }}>
          W
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-foreground leading-none">Workboard</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-none truncate">
            {semillero?.nombre || "Mi coordinación"}
          </p>
        </div>
      </button>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/70 flex-shrink-0" />

      {/* User card */}
      <div className="px-4 py-4 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl"
          style={{ background: "oklch(0.52 0.13 165 / 0.08)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.42 0.14 185))" }}>
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground truncate leading-snug">
              {userFirstName}
            </p>
            <p className="text-[10px] truncate leading-snug"
              style={{ color: "oklch(0.52 0.13 165)" }}>
              {isSuperAdmin ? "Super Admin" : isAdmin ? "Coordinador" : "Miembro"}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {isSuperAdmin && (
          <button
            onClick={() => navigate("/overview")}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mb-2 text-left"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--muted)"; e.currentTarget.style.color = "var(--foreground)" }}
            onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "var(--muted-foreground)" }}>
            <Home size={15} className="flex-shrink-0" />
            Página principal
          </button>
        )}
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-3">
          Menú principal
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
              } : {
                color: "var(--muted-foreground)",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--muted)" }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "" }}>
              <Icon size={16} className="flex-shrink-0" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/70 flex-shrink-0" />

      {/* Bottom actions */}
      <div className="px-3 py-4 space-y-0.5 flex-shrink-0">
        <button
          onClick={() => { resetTutorial(user?.email); setShowTutorial(true); setSidebarOpen(false) }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted text-left">
          <HelpCircle size={16} className="flex-shrink-0" />
          Tutorial
        </button>
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
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "oklch(0 0 0 / 45%)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {Sidebar}

      {/* ── MAIN AREA ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 0 }}
        /* On desktop, push right of sidebar */
      >
        <style>{`@media (min-width: 1024px) { .main-offset { margin-left: 228px; } }`}</style>
        <div className="main-offset flex flex-col min-h-screen flex-1">

          {/* ── TOP BAR ─────────────────────────────────────────────────── */}
          <header className="sticky top-0 z-20 h-14 border-b border-border/60 px-5 flex items-center gap-3"
            style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors flex-shrink-0"
              onClick={() => setSidebarOpen(v => !v)}>
              <Menu size={16} className="text-muted-foreground" />
            </button>

            {/* Page breadcrumb */}
            <div className="hidden lg:flex items-center gap-2">
              {isSuperAdmin ? (
                <button onClick={() => navigate("/overview")}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                  Workboard
                </button>
              ) : (
                <span className="text-[12px] text-muted-foreground">Workboard</span>
              )}
              {semillero?.nombre && (
                <>
                  <span className="text-[12px] text-muted-foreground">/</span>
                  <button onClick={() => setTab("resumen")}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                    {semillero.nombre}
                  </button>
                </>
              )}
              <span className="text-[12px] text-muted-foreground">/</span>
              <span className="text-[13px] font-semibold text-foreground">{pageTitle}</span>
            </div>

            {/* Mobile: page title */}
            <span className="lg:hidden text-[14px] font-semibold text-foreground">{pageTitle}</span>

            {/* Right side */}
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && tab === "equipo" && !selectionMode && (
                <>
                  <input ref={colleaguesFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleColleaguesFileSelected} />
                  <Button size="sm" variant="outline" className="h-8 text-[13px]"
                    onClick={() => colleaguesFileRef.current?.click()}
                    disabled={importColleaguesLoading}>
                    <Upload size={13} className="mr-1" /> {importColleaguesLoading ? "Leyendo…" : "Importar"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-[13px]"
                    onClick={() => { setSelectionMode(true); setSelectedIds(new Set()) }}>
                    <CheckSquare size={13} className="mr-1" /> Seleccionar
                  </Button>
                  <Button size="sm" className="h-8 text-[13px]" onClick={() => navigate(`/semillero/${semilleroId}/colleague/new`)}>
                    <Plus size={13} className="mr-1" /> Compañero
                  </Button>
                </>
              )}
              {isAdmin && tab === "equipo" && selectionMode && (
                <>
                  <span className="text-[13px] text-muted-foreground mr-1">
                    {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
                  </span>
                  <Button size="sm" variant="outline" className="h-8 text-[13px]"
                    onClick={() => { setSelectionMode(false); setSelectedIds(new Set()) }}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-8 text-[13px] font-semibold"
                    disabled={selectedIds.size === 0}
                    style={selectedIds.size > 0 ? { background: "var(--destructive)", color: "#fff" } : {}}
                    onClick={async () => {
                      if (!confirm(`¿Eliminar ${selectedIds.size} compañero${selectedIds.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return
                      await Promise.all([...selectedIds].map(id => deleteColleague(id).catch(() => {})))
                      setColleagues(prev => prev.filter(x => !selectedIds.has(x.id)))
                      setSelectionMode(false)
                      setSelectedIds(new Set())
                    }}>
                    <Trash2 size={13} className="mr-1" /> Eliminar {selectedIds.size > 0 ? selectedIds.size : ""}
                  </Button>
                </>
              )}
              {tab === "equipos" && (
                <Button size="sm" className="h-8 text-[13px]"
                  onClick={() => { setEditingEquipo(null); setEquipoForm({ nombre: "", descripcion: "", color: "295", esPrueba: false }); setShowEquipoForm(true) }}>
                  <Plus size={13} className="mr-1" /> Nuevo grupo
                </Button>
              )}
              <span data-tour="bell">
                <NotificationBell isAdmin={isAdmin} myColleagueId={myColleagueId} userEmail={user?.email} userUid={user?.uid} semilleroId={semilleroId} />
              </span>
              <ThemeToggle />
            </div>
          </header>

          {/* ── PAGE CONTENT ────────────────────────────────────────────── */}
          <main className="flex-1 p-5 sm:p-7">

            {/* ══ RESUMEN ═══════════════════════════════════════════════════ */}
            {isAdmin && tab === "resumen" && (
              <TeamDashboard colleagues={colleagues} logs={logs} />
            )}

            {/* ══ MÉTRICAS ══════════════════════════════════════════════════ */}
            {tab === "metricas" && (
              <MetricsDashboard colleagues={colleagues} logs={logs} />
            )}

            {/* ══ MI EQUIPO ═════════════════════════════════════════════════ */}
            {tab === "equipo" && (
              <div className="space-y-6">

                {/* Hero banner */}
                <div className="relative overflow-hidden rounded-2xl px-7 py-7"
                  style={{
                    background: "linear-gradient(125deg, oklch(0.46 0.13 165) 0%, oklch(0.40 0.14 185) 45%, oklch(0.48 0.14 245) 100%)",
                    boxShadow: "0 8px 32px oklch(0.52 0.13 165 / 25%)",
                  }}>
                  <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-10 pointer-events-none"
                    style={{ background: "radial-gradient(circle, oklch(1 0 0), transparent 70%)" }} />
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-8 pointer-events-none"
                    style={{ background: "radial-gradient(circle, oklch(0.58 0.16 295), transparent 70%)" }} />
                  {semillero?.nombre && (
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                      style={{ color: "oklch(1 0 0 / 0.55)" }}>
                      {semillero.nombre}
                    </p>
                  )}
                  <h3 className="text-[24px] font-bold text-white leading-tight mb-1">
                    Hola, {userFirstName}
                  </h3>
                  <p className="text-[13px]" style={{ color: "oklch(1 0 0 / 0.65)" }}>
                    {loadingData
                      ? "Cargando datos del equipo…"
                      : `${colleagues.length} personas · ${totalProjects} actividades · ${totalTools} herramientas`}
                  </p>
                </div>

                {/* Stat cards */}
                {loadingData ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-11 h-11 rounded-xl bg-muted flex-shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-3 w-16 bg-muted rounded" />
                            <div className="h-6 w-10 bg-muted rounded" />
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      {
                        icon: <Users size={20} />,
                        value: colleagues.length,
                        label: "Personas",
                        sub: `${colleaguesWithProjects} con actividades activas`,
                        progress: colleagues.length > 0 ? colleaguesWithProjects / colleagues.length : 0,
                        hue: 165,
                      },
                      {
                        icon: <Briefcase size={20} />,
                        value: totalProjects,
                        label: "Actividades",
                        sub: `Avance promedio: ${avgProgress}%`,
                        progress: avgProgress / 100,
                        hue: 230,
                      },
                      {
                        icon: <Wrench size={20} />,
                        value: totalTools,
                        label: "Herramientas",
                        sub: topTool ? `Más usada: ${topTool}` : "en uso en el equipo",
                        progress: Math.min(1, totalTools / 20),
                        hue: 295,
                      },
                    ].map((stat) => (
                      <div key={stat.label} className="relative overflow-hidden rounded-2xl border border-border bg-card flex gap-4 items-start p-5">
                        {/* Floating icon box */}
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 mt-0.5"
                          style={{
                            background: `linear-gradient(135deg, oklch(0.62 0.18 ${stat.hue}), oklch(0.50 0.20 ${(stat.hue + 20) % 360}))`,
                            boxShadow: `0 6px 18px oklch(0.60 0.18 ${stat.hue} / 35%)`,
                          }}>
                          {stat.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">
                            {stat.label}
                          </p>
                          <p className="text-[28px] font-black text-foreground leading-none mb-1">{stat.value}</p>
                          <p className="text-[11px] text-muted-foreground truncate mb-3">{stat.sub}</p>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.round(stat.progress * 100)}%`,
                                background: `oklch(0.62 0.18 ${stat.hue})`,
                              }} />
                          </div>
                        </div>
                        {/* Glow bg */}
                        <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none opacity-15"
                          style={{ background: `radial-gradient(circle at top right, oklch(0.65 0.18 ${stat.hue}), transparent 70%)`, filter: "blur(16px)" }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Coordinadores del equipo */}
                {!loadingData && (() => {
                  const allCoordUids = new Set([
                    ...teamCoordUids,
                    ...(semillero?.coordinadores || []),
                  ])
                  const extraIds = new Set(semillero?.coordinadoresColegas || [])
                  const coords = colleagues.filter(c =>
                    (c.uid && allCoordUids.has(c.uid)) ||
                    (!c.uid && c.rolAsignado === "admin") ||
                    extraIds.has(c.id)
                  )
                  const nonCoords = colleagues.filter(c => !coords.some(x => x.id === c.id))

                  const handleAddCoord = async (colleagueId) => {
                    if (!colleagueId) return
                    setSavingCoord(true)
                    const updated = [...(semillero?.coordinadoresColegas || []), colleagueId]
                    await updateSemillero(semilleroId, { coordinadoresColegas: updated })
                    setSemillero(prev => ({ ...prev, coordinadoresColegas: updated }))
                    setShowCoordPicker(false)
                    setSavingCoord(false)
                  }

                  const handleRemoveCoord = async (colleagueId) => {
                    const updated = (semillero?.coordinadoresColegas || []).filter(id => id !== colleagueId)
                    await updateSemillero(semilleroId, { coordinadoresColegas: updated })
                    setSemillero(prev => ({ ...prev, coordinadoresColegas: updated }))
                  }

                  return (
                    <div className="rounded-2xl border overflow-hidden"
                      style={{ borderColor: "oklch(0.52 0.13 165 / 0.25)" }}>
                      <div className="px-4 py-2 border-b flex items-center justify-between"
                        style={{ background: "oklch(0.52 0.13 165 / 0.08)", borderColor: "oklch(0.52 0.13 165 / 0.18)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "oklch(0.42 0.13 165)" }}>
                          {coords.length === 1 ? "Coordinador del equipo" : "Coordinadores del equipo"}
                        </p>
                        {isSuperAdmin && (
                          <button onClick={() => setShowCoordPicker(v => !v)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors"
                            style={{ background: "oklch(0.52 0.13 165 / 0.15)", color: "oklch(0.40 0.13 165)" }}>
                            {showCoordPicker ? "Cancelar" : "+ Asignar"}
                          </button>
                        )}
                      </div>
                      {showCoordPicker && isSuperAdmin && (
                        <div className="px-4 py-2.5 border-b" style={{ borderColor: "oklch(0.52 0.13 165 / 0.12)" }}>
                          <select onChange={e => handleAddCoord(e.target.value)} defaultValue=""
                            className="w-full text-[12px] bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none">
                            <option value="" disabled>Seleccionar colega…</option>
                            {nonCoords.map(c => (
                              <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {coords.length === 0 && !showCoordPicker ? (
                        <div className="px-4 py-3">
                          <p className="text-[12px] text-muted-foreground italic">Sin coordinador asignado.</p>
                        </div>
                      ) : (
                        coords.map(coord => {
                          const h = coord.colorHue ?? hashHue(coord.id)
                          const h2 = coord.colorHue2 ?? null
                          const isExtra = extraIds.has(coord.id)
                          return (
                            <div key={coord.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0"
                              style={{ background: "oklch(0.52 0.13 165 / 0.03)", borderColor: "oklch(0.52 0.13 165 / 0.12)" }}>
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 overflow-hidden"
                                style={{ background: coord.avatarUrl ? "var(--muted)" : `linear-gradient(135deg, oklch(0.68 0.18 ${h}), oklch(0.54 0.22 ${h2 ?? (parseInt(h) + 40) % 360}))` }}>
                                {coord.avatarUrl
                                  ? <img src={coord.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  : (coord.nombre?.charAt(0)?.toUpperCase() || "?")}
                              </div>
                              <span className="flex-1 text-[13px] font-semibold text-foreground truncate">{coord.nombre}</span>
                              {isSuperAdmin && isExtra && (
                                <button onClick={() => handleRemoveCoord(coord.id)}
                                  className="text-[10px] text-destructive hover:opacity-70 transition-opacity flex-shrink-0">✕</button>
                              )}
                              <button onClick={() => navigate(`/semillero/${semilleroId}/colleague/${coord.id}`)}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
                                style={{ background: "oklch(0.52 0.13 165 / 0.12)", color: "oklch(0.40 0.13 165)" }}>
                                Ver perfil
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })()}

                {/* Filter bar */}
                {!loadingData && colleagues.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1" data-tour="search">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Buscar persona, rol o herramienta…"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          className="w-full h-9 bg-card border border-border rounded-xl pl-9 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary/40 transition-all"
                        />
                      </div>
                      <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 flex-shrink-0">
                        <button onClick={() => setViewMode("grid")} title="Vista cuadrícula"
                          className="w-8 h-8 flex items-center justify-center rounded-md transition-all"
                          style={viewMode === "grid" ? { background: "var(--card)", boxShadow: "0 1px 3px oklch(0 0 0 / 10%)" } : {}}>
                          <LayoutGrid size={14} className={viewMode === "grid" ? "text-foreground" : "text-muted-foreground"} />
                        </button>
                        <button onClick={() => setViewMode("list")} title="Vista lista"
                          className="w-8 h-8 flex items-center justify-center rounded-md transition-all"
                          style={viewMode === "list" ? { background: "var(--card)", boxShadow: "0 1px 3px oklch(0 0 0 / 10%)" } : {}}>
                          <LayoutList size={14} className={viewMode === "list" ? "text-foreground" : "text-muted-foreground"} />
                        </button>
                      </div>
                    </div>
                    {(allRoles.length > 0 || allAreas.length > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Filtrar:
                        </span>
                        {allRoles.slice(0, 4).map(role => (
                          <button key={role}
                            onClick={() => setFilterRole(filterRole === role ? null : role)}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap"
                            style={filterRole === role ? {
                              background: "oklch(0.52 0.13 165)",
                              color: "oklch(1 0 0)",
                              borderColor: "oklch(0.52 0.13 165)",
                            } : {
                              background: "var(--card)",
                              color: "var(--muted-foreground)",
                              borderColor: "var(--border)",
                            }}>
                            {role.split(" ").slice(0, 2).join(" ")}
                          </button>
                        ))}
                        {allAreas.slice(0, 3).map(area => (
                          <button key={area}
                            onClick={() => setFilterArea(filterArea === area ? null : area)}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap"
                            style={filterArea === area ? {
                              background: "oklch(0.62 0.12 230)",
                              color: "oklch(1 0 0)",
                              borderColor: "oklch(0.62 0.12 230)",
                            } : {
                              background: "var(--card)",
                              color: "var(--muted-foreground)",
                              borderColor: "var(--border)",
                            }}>
                            {area}
                          </button>
                        ))}
                        {(filterRole || filterArea) && (
                          <button
                            onClick={() => { setFilterRole(null); setFilterArea(null) }}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <X size={11} /> Limpiar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Directivos institucionales */}
                <div className="flex flex-wrap gap-3 mb-2">
                  {DIRECTIVOS.map(d => (
                    <div key={d.email} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-card">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, oklch(0.62 0.16 ${d.hue}), oklch(0.48 0.20 ${(d.hue + 30) % 360}))` }}>
                        {d.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-foreground leading-tight truncate">{d.nombre}</p>
                        <p className="text-[10px] font-semibold leading-tight" style={{ color: `oklch(0.62 0.16 ${d.hue})` }}>{d.rol}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Person grid / list / empty */}
                {loadingData ? (
                  <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`animate-pulse bg-card border border-border ${viewMode === "grid" ? "rounded-2xl p-5" : "rounded-xl px-5 py-4 flex items-center gap-4"}`}>
                        {viewMode === "grid" ? (
                          <>
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
                              <div className="flex-1 space-y-2">
                                <div className="h-3.5 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                              </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full mb-3" />
                            <div className="flex gap-1.5">
                              <div className="h-5 w-14 bg-muted rounded-full" />
                              <div className="h-5 w-16 bg-muted rounded-full" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-muted rounded w-1/3" />
                              <div className="h-3 bg-muted rounded w-1/4" />
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : colleagues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                    <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
                      style={{ background: "oklch(0.52 0.13 165 / 0.10)" }}>
                      <UserCircle size={28} style={{ color: "oklch(0.52 0.13 165)" }} />
                    </div>
                    <p className="font-semibold text-foreground text-[15px]">Sin compañeros aún</p>
                    <p className="text-[13px] mt-1">Agrega el primero para empezar.</p>
                    {isAdmin && (
                      <Button size="sm" className="mt-5" onClick={() => navigate(`/semillero/${semilleroId}/colleague/new`)}>
                        <Plus size={13} className="mr-1" /> Agregar compañero
                      </Button>
                    )}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-20">
                    <Search size={28} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-[15px] font-semibold text-foreground mb-1">Sin resultados</p>
                    <p className="text-[13px] text-muted-foreground">Intenta con otro término o limpia los filtros.</p>
                  </div>
                ) : viewMode === "grid" ? (

                  /* ── GRID ── */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="cards">
                    {filtered.map((c) => {
                      const h = c.colorHue ?? hashHue(c.id)
                      const h2 = c.colorHue2 ?? null
                      const projectCount = c.proyectos?.length || 0
                      const workScore = calcWorkloadScore(c.proyectos)
                      const isSelected = selectedIds.has(c.id)
                      return (
                        <div key={c.id}
                          className="group relative rounded-2xl bg-card border flex flex-col cursor-pointer"
                          style={{
                            transition: "transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease",
                            borderColor: isSelected ? `oklch(0.62 0.18 ${h})` : undefined,
                            boxShadow: isSelected ? `0 0 0 2px oklch(0.62 0.18 ${h} / 0.35)` : undefined,
                          }}
                          onClick={() => {
                            if (selectionMode) {
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                                return next
                              })
                            } else {
                              navigate(`/semillero/${semilleroId}/colleague/${c.id}`)
                            }
                          }}
                          onMouseEnter={e => {
                            if (selectionMode) return
                            e.currentTarget.style.transform = "translateY(-3px)"
                            e.currentTarget.style.boxShadow = `0 16px 48px oklch(0.55 0.18 ${h} / 16%), 0 4px 16px oklch(0 0 0 / 10%)`
                            e.currentTarget.style.borderColor = `oklch(0.62 0.18 ${h} / 0.4)`
                          }}
                          onMouseLeave={e => {
                            if (selectionMode) return
                            e.currentTarget.style.transform = ""
                            e.currentTarget.style.boxShadow = ""
                            e.currentTarget.style.borderColor = ""
                          }}>

                          {/* Top stripe */}
                          <div className="h-[3px] w-full flex-shrink-0 rounded-tl-2xl rounded-tr-2xl"
                            style={{ background: `linear-gradient(90deg, oklch(0.62 0.18 ${h}), oklch(0.55 0.18 ${h2 ?? (h + 40) % 360} / 0.4))` }} />

                          <div className="flex-1 p-5 space-y-3.5 relative">

                            {/* Selection checkbox */}
                            {selectionMode && (
                              <div className="absolute top-0 left-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
                                style={{
                                  borderColor: isSelected ? `oklch(0.62 0.18 ${h})` : "var(--border)",
                                  background: isSelected ? `oklch(0.62 0.18 ${h})` : "var(--background)",
                                }}>
                                {isSelected && <svg viewBox="0 0 10 8" fill="none" className="w-[9px] h-[7px]"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </div>
                            )}

                            {/* ⋮ menu */}
                            <div className="absolute top-0 right-0" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={e => { e.stopPropagation(); setOpenCardMenu(openCardMenu === c.id ? null : c.id) }}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-all ${selectionMode ? "hidden" : "opacity-0 group-hover:opacity-100"}`}>
                                <MoreHorizontal size={14} className="text-muted-foreground" />
                              </button>
                              {openCardMenu === c.id && (
                                <div className="absolute right-0 top-8 w-44 bg-popover border border-border rounded-xl z-30 overflow-hidden"
                                  style={{ boxShadow: "0 8px 32px oklch(0 0 0 / 20%)" }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); navigate(`/semillero/${semilleroId}/colleague/${c.id}`); setOpenCardMenu(null) }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left">
                                    <ExternalLink size={13} className="text-muted-foreground flex-shrink-0" />
                                    Ver perfil
                                  </button>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      navigator.clipboard?.writeText(c.correo || c.email || "")
                                      setOpenCardMenu(null)
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left">
                                    <Copy size={13} className="text-muted-foreground flex-shrink-0" />
                                    Copiar correo
                                  </button>
                                  {isAdmin && (
                                    <>
                                      <div className="mx-3 my-1 h-px bg-border" />
                                      <button
                                        onClick={async e => {
                                          e.stopPropagation()
                                          setOpenCardMenu(null)
                                          if (!confirm(`¿Eliminar a ${c.nombre}?`)) return
                                          await deleteColleague(c.id).catch(() => {})
                                          setColleagues(prev => prev.filter(x => x.id !== c.id))
                                        }}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold transition-colors text-left"
                                        style={{ color: "var(--destructive)" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "oklch(0.577 0.245 27.325 / 0.10)"}
                                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                                        <Trash2 size={13} className="flex-shrink-0" />
                                        Eliminar
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Avatar + Name */}
                            <div className="flex items-start gap-3">
                              <WorkloadRing count={workScore} size={52}>
                                <div className="w-full h-full flex items-center justify-center text-white font-bold text-[15px] overflow-hidden"
                                  style={c.avatarUrl ? { background: "var(--muted)" } : { background: `linear-gradient(135deg, oklch(0.68 0.18 ${h}), oklch(0.54 0.22 ${h2 ?? (h + 40) % 360}))` }}>
                                  {c.avatarUrl
                                    ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                                    : c.avatarEmoji
                                      ? <span className="text-lg leading-none">{c.avatarEmoji}</span>
                                      : c.nombre?.charAt(0).toUpperCase()
                                  }
                                </div>
                              </WorkloadRing>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-[15px] text-foreground leading-tight">{c.nombre}</p>
                                  {c.id === myColleagueId && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide flex-shrink-0"
                                      style={{ backgroundColor: "oklch(0.52 0.13 165 / 0.14)", color: "oklch(0.42 0.13 165)" }}>
                                      TÚ
                                    </span>
                                  )}
                                </div>
                                {(() => {
                                  const dir = DIRECTIVOS.find(d => d.email === c.email)
                                  const label = c.rol || dir?.rol
                                  return label
                                    ? <p className="text-[12px] font-semibold mt-0.5 truncate" style={{ color: dir && !c.rol ? `oklch(0.62 0.16 ${dir.hue})` : "var(--muted-foreground)" }}>{label}</p>
                                    : <p className="text-[12px] text-muted-foreground mt-0.5 truncate">Sin rol</p>
                                })()}
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {c.area && (
                                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full leading-4"
                                      style={{ backgroundColor: `oklch(0.60 0.18 ${h} / 0.13)`, color: `oklch(0.50 0.20 ${h})` }}>
                                      {c.area}
                                    </span>
                                  )}
                                  {colleagueEquipoMap[c.id] && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full leading-4"
                                      style={{
                                        backgroundColor: `oklch(0.62 0.22 ${colleagueEquipoMap[c.id].color || "295"} / 0.13)`,
                                        color: `oklch(0.52 0.22 ${colleagueEquipoMap[c.id].color || "295"})`,
                                      }}>
                                      <Users size={9} />
                                      {colleagueEquipoMap[c.id].nombre}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {c.trabajaEn && (
                              <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{c.trabajaEn}</p>
                            )}

                            {/* Workload bar */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                  {(() => {
                                    const active = (c.proyectos || []).filter(p => p.estado !== "Finalizado" && p.estado !== "Hecho" && p.estado !== "Suspendido").length
                                    const done   = (c.proyectos || []).filter(p => p.estado === "Finalizado" || p.estado === "Hecho").length
                                    return <>{active} activo{active !== 1 ? "s" : ""}{done > 0 && <span className="opacity-55"> · {done} fin.</span>}</>
                                  })()}
                                </span>
                                <span className="text-[10px] font-semibold" style={{ color: workloadRingColor(workScore) }}>
                                  {workloadLabel(workScore)}{workScore > 0 ? ` · ${workScore}` : ""}
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, workScore * 25)}%`, background: workloadRingColor(workScore) }} />
                              </div>
                            </div>

                            {/* Tool chips */}
                            {c.herramientas?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {c.herramientas.slice(0, 3).map(tool => (
                                  <span key={tool}
                                    className="text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap"
                                    style={{
                                      borderColor: `oklch(0.62 0.12 ${h} / 0.25)`,
                                      color: `oklch(0.55 0.12 ${h})`,
                                      background: `oklch(0.62 0.10 ${h} / 0.07)`,
                                    }}>
                                    {tool}
                                  </span>
                                ))}
                                {c.herramientas.length > 3 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground cursor-default"
                                    title={c.herramientas.slice(3).join(", ")}>
                                    +{c.herramientas.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                ) : (

                  /* ── LIST ── */
                  <div className="space-y-1.5" data-tour="cards">
                    {filtered.map((c) => {
                      const h = c.colorHue ?? hashHue(c.id)
                      const h2 = c.colorHue2 ?? null
                      const projectCount = c.proyectos?.length || 0
                      const workScore = calcWorkloadScore(c.proyectos)
                      return (
                        <a key={c.id} href={`/semillero/${semilleroId}/colleague/${c.id}`}
                          className="group flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-3.5 hover:border-primary/25 hover:shadow-sm transition-all"
                          style={{ borderLeft: `3px solid oklch(0.62 0.18 ${h})` }}>
                          <WorkloadRing count={workScore} size={44}>
                            <div className="w-full h-full flex items-center justify-center text-white font-bold text-[13px] overflow-hidden"
                              style={c.avatarUrl ? { background: "var(--muted)" } : { background: `linear-gradient(135deg, oklch(0.68 0.18 ${h}), oklch(0.54 0.22 ${h2 ?? (h + 40) % 360}))` }}>
                              {c.avatarUrl
                                ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                                : c.avatarEmoji
                                  ? <span className="text-base leading-none">{c.avatarEmoji}</span>
                                  : c.nombre?.charAt(0).toUpperCase()
                              }
                            </div>
                          </WorkloadRing>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-[14px] text-foreground">{c.nombre}</p>
                              {c.id === myColleagueId && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wide"
                                  style={{ backgroundColor: "oklch(0.52 0.13 165 / 0.14)", color: "oklch(0.42 0.13 165)" }}>
                                  TÚ
                                </span>
                              )}
                              {c.area && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full hidden sm:inline-block"
                                  style={{ backgroundColor: `oklch(0.60 0.18 ${h} / 0.10)`, color: `oklch(0.50 0.20 ${h})` }}>
                                  {c.area}
                                </span>
                              )}
                            </div>
                            {(() => {
                              const dir = DIRECTIVOS.find(d => d.email === c.email)
                              const label = c.rol || dir?.rol
                              return label
                                ? <p className="text-[12px] font-semibold truncate" style={{ color: dir && !c.rol ? `oklch(0.62 0.16 ${dir.hue})` : "var(--muted-foreground)" }}>{label}</p>
                                : <p className="text-[12px] text-muted-foreground truncate">Sin rol</p>
                            })()}
                          </div>
                          <div className="hidden sm:flex gap-1 flex-wrap max-w-[140px] justify-end">
                            {(c.herramientas || []).slice(0, 2).map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground whitespace-nowrap">{t}</span>
                            ))}
                            {(c.herramientas || []).length > 2 && (
                              <span className="text-[10px] text-muted-foreground" title={(c.herramientas || []).slice(2).join(", ")}>
                                +{c.herramientas.length - 2}
                              </span>
                            )}
                          </div>
                          <div className="hidden md:flex flex-col gap-1 w-24 flex-shrink-0">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(100, workScore * 25)}%`, background: workloadRingColor(workScore) }} />
                            </div>
                            <span className="text-[10px] font-semibold text-right" style={{ color: workloadRingColor(workScore) }}>
                              {workloadLabel(workScore)}{workScore > 0 ? ` · ${workScore}` : ""}
                            </span>
                          </div>
                          <span className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0">→</span>
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ GRUPOS ════════════════════════════════════════════════════ */}
            {tab === "equipos" && (
              <div className="space-y-4">

                {showEquipoForm && !editingEquipo && (
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <p className="text-[13px] font-semibold text-foreground">Nuevo grupo</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Nombre del grupo *" value={equipoForm.nombre}
                        onChange={e => setEquipoForm(f => ({ ...f, nombre: e.target.value }))}
                        className="bg-muted/50 border border-border rounded-xl px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                      <input placeholder="Descripción (opcional)" value={equipoForm.descripcion}
                        onChange={e => setEquipoForm(f => ({ ...f, descripcion: e.target.value }))}
                        className="bg-muted/50 border border-border rounded-xl px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground mb-1">Color:</p>
                      <div className="flex items-center gap-2">
                        <label className="flex-shrink-0 relative w-8 h-8 rounded-xl border border-border overflow-hidden cursor-pointer hover:scale-105 transition-transform block"
                          style={{ background: eqHex }}>
                          <input type="color" value={eqHex}
                            onChange={e => setEquipoForm(f => ({ ...f, color: hexToHue(e.target.value) }))}
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0 }} />
                        </label>
                        <div className="flex items-center gap-1 bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 flex-1">
                          <span className="text-[12px] font-mono text-muted-foreground">#</span>
                          <input type="text"
                            value={editingEquipoHex !== null ? editingEquipoHex : eqHex.slice(1).toUpperCase()}
                            onFocus={() => setEditingEquipoHex(eqHex.slice(1).toUpperCase())}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
                              setEditingEquipoHex(raw)
                              if (raw.length === 6) setEquipoForm(f => ({ ...f, color: hexToHue("#" + raw) }))
                            }}
                            onBlur={() => setEditingEquipoHex(null)}
                            maxLength={6} placeholder="RRGGBB"
                            className="w-full text-[12px] font-mono bg-transparent text-foreground outline-none" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{equipoForm.color}°</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[["R", "r"], ["G", "g"], ["B", "b"]].map(([lbl, ch]) => (
                          <div key={ch} className="flex-1 flex items-center gap-1.5 bg-muted/50 border border-border/60 rounded-lg px-2 py-1">
                            <span className="text-[10px] font-bold text-muted-foreground">{lbl}</span>
                            <input type="number" min="0" max="255" value={eqRgb[ch]}
                              onChange={e => {
                                const upd = { ...eqRgb, [ch]: Math.max(0, Math.min(255, Number(e.target.value) || 0)) }
                                setEquipoForm(f => ({ ...f, color: hexToHue(rgbToHex(upd.r, upd.g, upd.b)) }))
                              }}
                              className="w-full text-[11px] font-mono bg-transparent text-foreground outline-none" />
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="h-1.5 rounded-full overflow-hidden mb-1"
                          style={{ background: "linear-gradient(to right,oklch(0.62 0.20 0),oklch(0.62 0.20 60),oklch(0.62 0.20 120),oklch(0.62 0.20 180),oklch(0.62 0.20 240),oklch(0.62 0.20 300),oklch(0.62 0.20 360))" }} />
                        <style>{`.eq-c::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px oklch(0 0 0/30%);background:oklch(0.62 0.22 ${equipoForm.color});cursor:pointer}`}</style>
                        <input type="range" min="0" max="359" step="1"
                          className="eq-c w-full h-1.5 rounded-full appearance-none bg-transparent cursor-pointer"
                          value={parseInt(equipoForm.color) || 295}
                          onChange={e => setEquipoForm(f => ({ ...f, color: String(e.target.value) }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEquipo} disabled={savingEquipo}>
                        {savingEquipo ? "Guardando…" : "Crear grupo"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowEquipoForm(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {editingEquipo && (
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-4"
                    style={{ borderLeft: `3px solid oklch(0.62 0.22 ${equipoForm.color || "295"})` }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-foreground">Editando: {editingEquipo.nombre}</p>
                      {isAdmin && (
                        <button
                          onClick={() => { importingEquipoIdRef.current = editingEquipo.id; setImportingEquipoId(editingEquipo.id); setImportPreview(null); setImportError(""); contactsInputRef.current?.click() }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110 active:scale-95"
                          style={{ background: `oklch(0.62 0.20 ${equipoForm.color || "295"})`, color: "#fff", boxShadow: `0 2px 8px oklch(0.52 0.20 ${equipoForm.color || "295"} / 35%)` }}>
                          <Upload size={12} />
                          Importar participantes
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input placeholder="Nombre *" value={equipoForm.nombre}
                        onChange={e => setEquipoForm(f => ({ ...f, nombre: e.target.value }))}
                        className="bg-muted/50 border border-border rounded-xl px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                      <input placeholder="Descripción (opcional)" value={equipoForm.descripcion}
                        onChange={e => setEquipoForm(f => ({ ...f, descripcion: e.target.value }))}
                        className="bg-muted/50 border border-border rounded-xl px-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground mb-1">Color:</p>
                      <div className="flex items-center gap-2">
                        <label className="flex-shrink-0 relative w-8 h-8 rounded-xl border border-border overflow-hidden cursor-pointer hover:scale-105 transition-transform block"
                          style={{ background: eqHex }}>
                          <input type="color" value={eqHex}
                            onChange={e => setEquipoForm(f => ({ ...f, color: hexToHue(e.target.value) }))}
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0 }} />
                        </label>
                        <div className="flex items-center gap-1 bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 flex-1">
                          <span className="text-[12px] font-mono text-muted-foreground">#</span>
                          <input type="text"
                            value={editingEquipoHex !== null ? editingEquipoHex : eqHex.slice(1).toUpperCase()}
                            onFocus={() => setEditingEquipoHex(eqHex.slice(1).toUpperCase())}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase()
                              setEditingEquipoHex(raw)
                              if (raw.length === 6) setEquipoForm(f => ({ ...f, color: hexToHue("#" + raw) }))
                            }}
                            onBlur={() => setEditingEquipoHex(null)}
                            maxLength={6} placeholder="RRGGBB"
                            className="w-full text-[12px] font-mono bg-transparent text-foreground outline-none" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{equipoForm.color}°</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[["R", "r"], ["G", "g"], ["B", "b"]].map(([lbl, ch]) => (
                          <div key={ch} className="flex-1 flex items-center gap-1.5 bg-muted/50 border border-border/60 rounded-lg px-2 py-1">
                            <span className="text-[10px] font-bold text-muted-foreground">{lbl}</span>
                            <input type="number" min="0" max="255" value={eqRgb[ch]}
                              onChange={e => {
                                const upd = { ...eqRgb, [ch]: Math.max(0, Math.min(255, Number(e.target.value) || 0)) }
                                setEquipoForm(f => ({ ...f, color: hexToHue(rgbToHex(upd.r, upd.g, upd.b)) }))
                              }}
                              className="w-full text-[11px] font-mono bg-transparent text-foreground outline-none" />
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="h-1.5 rounded-full overflow-hidden mb-1"
                          style={{ background: "linear-gradient(to right,oklch(0.62 0.20 0),oklch(0.62 0.20 60),oklch(0.62 0.20 120),oklch(0.62 0.20 180),oklch(0.62 0.20 240),oklch(0.62 0.20 300),oklch(0.62 0.20 360))" }} />
                        <input type="range" min="0" max="359" step="1"
                          className="eq-c w-full h-1.5 rounded-full appearance-none bg-transparent cursor-pointer"
                          value={parseInt(equipoForm.color) || 295}
                          onChange={e => setEquipoForm(f => ({ ...f, color: String(e.target.value) }))} />
                      </div>
                    </div>
                    {(() => {
                      const liveEquipo = equipos.find(e => e.id === editingEquipo.id) || editingEquipo
                      const memberIds = new Set(liveEquipo.miembros || [])
                      const memberCount = colleagues.filter(c => memberIds.has(c.id)).length
                      return (
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                            Compañeros — {memberCount} en el grupo
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {colleagues.map(c => {
                              const ch = c.colorHue ?? hashHue(c.id)
                              const isMember = memberIds.has(c.id)
                              return (
                                <button key={c.id}
                                  onClick={() => handleToggleMember(editingEquipo.id, c.id)}
                                  title={isMember ? `Quitar a ${c.nombre}` : `Agregar a ${c.nombre}`}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-all"
                                  style={isMember ? {
                                    borderColor: `oklch(0.62 0.18 ${ch})`,
                                    background: `oklch(0.62 0.18 ${ch} / 0.12)`,
                                    color: "var(--foreground)",
                                  } : {
                                    borderColor: "var(--border)",
                                    background: "transparent",
                                    color: "var(--muted-foreground)",
                                  }}>
                                  <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                                    style={{ background: c.avatarUrl ? "var(--muted)" : `oklch(0.68 0.18 ${ch})` }}>
                                    {c.avatarUrl
                                      ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                                      : c.avatarEmoji
                                        ? <span className="text-xs leading-none">{c.avatarEmoji}</span>
                                        : c.nombre?.charAt(0).toUpperCase()
                                    }
                                  </div>
                                  <span className="font-medium">{c.nombre?.split(" ").slice(0, 2).join(" ")}</span>
                                  {c.rol && <span className="text-[10px] opacity-50">· {c.rol.split(" ")[0]}</span>}
                                  {isMember
                                    ? <X size={11} className="ml-0.5 flex-shrink-0" style={{ color: "oklch(0.60 0.18 27)" }} />
                                    : <Plus size={10} className="ml-0.5 opacity-40 flex-shrink-0" />
                                  }
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                    {isAdmin && (
                      <div className="flex items-center gap-2 pt-1">
                        <input type="checkbox" id="esPrueba" checked={!!equipoForm.esPrueba}
                          onChange={e => setEquipoForm(f => ({ ...f, esPrueba: e.target.checked }))}
                          className="w-4 h-4 accent-amber-500" />
                        <label htmlFor="esPrueba" className="text-[12px] text-muted-foreground cursor-pointer select-none">
                          Grupo de prueba — <span className="text-amber-500 font-medium">no enviar notificaciones de WhatsApp</span>
                        </label>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1 border-t border-border">
                      <Button size="sm" onClick={handleSaveEquipo} disabled={savingEquipo}>
                        {savingEquipo ? "Guardando…" : "Guardar cambios"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingEquipo(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {(() => {
                  const visibleEquipos = isAdmin
                    ? equipos
                    : equipos.filter(eq => (eq.miembros || []).includes(myColleagueId))
                  const emptyMsg = isAdmin ? "Crea el primero con el botón de arriba." : "Pídele al admin que te agregue."
                  return visibleEquipos.length === 0 && !showEquipoForm && !editingEquipo ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                      <Users size={32} className="mb-3 opacity-30" />
                      <p className="font-semibold text-foreground text-[15px]">Sin grupos</p>
                      <p className="text-[13px] mt-1">{emptyMsg}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {visibleEquipos.map(eq => {
                        const eqColor = eq.color || "295"
                        const miembros = (eq.miembros || []).map(cid => colleagues.find(c => c.id === cid)).filter(Boolean)
                        const isActive = editingEquipo?.id === eq.id
                        const isMemberOfGroup = myColleagueId && (eq.miembros || []).includes(myColleagueId)
                        const canEditGroup = isAdmin || isMemberOfGroup
                        return (
                          <div key={eq.id}
                            className="relative rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => navigate(`/semillero/${semilleroId}/grupo/${eq.id}`)}
                            style={{
                              background: `linear-gradient(150deg, var(--card), oklch(0.60 0.14 ${eqColor} / 0.06))`,
                              border: "1px solid var(--border)",
                              borderLeft: `3px solid oklch(0.62 0.18 ${eqColor})`,
                              boxShadow: isActive ? `0 0 0 2px oklch(0.62 0.22 ${eqColor} / 40%)` : "0 2px 10px oklch(0 0 0 / 7%)",
                            }}>
                            <div className="p-5">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ background: `oklch(0.62 0.22 ${eqColor})` }} />
                                    <h3 className="font-bold text-foreground text-[15px] truncate">{eq.nombre}</h3>
                                  </div>
                                  {eq.descripcion && (
                                    <p className="text-[12px] text-muted-foreground ml-4 truncate">{eq.descripcion}</p>
                                  )}
                                </div>
                                {canEditGroup && (
                                  <div className="flex gap-2 ml-2 flex-shrink-0">
                                    <button onClick={e => { e.stopPropagation(); setEditingEquipo(eq); setEquipoForm({ nombre: eq.nombre, descripcion: eq.descripcion || "", color: eq.color || "295", esPrueba: !!eq.esPrueba }); setShowEquipoForm(false) }}
                                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                                      <Pencil size={11} />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); handleDeleteEquipo(eq.id) }}
                                      className="text-[11px] text-destructive/60 hover:text-destructive transition-colors">
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {miembros.length > 0 && (
                                <div className="flex items-center gap-1.5 mb-3">
                                  <div className="flex -space-x-2">
                                    {miembros.slice(0, 5).map(c => {
                                      const ch = c.colorHue ?? hashHue(c.id)
                                      const ch2 = c.colorHue2 ?? null
                                      return (
                                        <div key={c.id}
                                          className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] ring-2 ring-card flex-shrink-0 overflow-hidden"
                                          style={{ background: c.avatarUrl ? "var(--muted)" : `linear-gradient(135deg, oklch(0.68 0.18 ${ch}), oklch(0.54 0.22 ${ch2 ?? (ch + 40) % 360}))` }}
                                          title={c.nombre}>
                                          {c.avatarUrl
                                            ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                                            : c.avatarEmoji
                                              ? <span className="text-sm leading-none">{c.avatarEmoji}</span>
                                              : c.nombre?.charAt(0).toUpperCase()
                                          }
                                        </div>
                                      )
                                    })}
                                    {miembros.length > 5 && (
                                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                                        +{miembros.length - 5}
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground ml-1">{miembros.length} en la plataforma</span>
                                  {(participantCounts[eq.id] || eq.participantesCount || 0) > 0 && (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                      style={{ background: `oklch(0.62 0.18 ${eqColor} / 0.13)`, color: `oklch(0.48 0.20 ${eqColor})` }}>
                                      {participantCounts[eq.id] ?? eq.participantesCount} participantes
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="space-y-1.5">
                                {miembros.length === 0 ? (
                                  <p className="text-[12px] text-muted-foreground italic">Sin miembros. Usa el lápiz para agregar.</p>
                                ) : (
                                  miembros.map(c => {
                                    const ch = c.colorHue ?? hashHue(c.id)
                                    return (
                                      <a key={c.id} href={`/semillero/${semilleroId}/colleague/${c.id}`} onClick={e => e.stopPropagation()}
                                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/60 transition-colors group">
                                        <div className="w-6 h-6 rounded flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0 overflow-hidden"
                                          style={{ background: c.avatarUrl ? "var(--muted)" : `oklch(0.68 0.18 ${ch})` }}>
                                          {c.avatarUrl
                                            ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                                            : c.avatarEmoji
                                              ? <span className="text-xs leading-none">{c.avatarEmoji}</span>
                                              : c.nombre?.charAt(0).toUpperCase()
                                          }
                                        </div>
                                        <span className="text-[12px] font-medium text-foreground truncate flex-1">
                                          {c.nombre?.split(" ").slice(0, 2).join(" ")}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground truncate">{c.rol?.split(" ")[0]}</span>
                                        <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto">→</span>
                                      </a>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

          </main>

          <Footer />
        </div>
      </div>

      {/* ══ IMPORT COMPAÑEROS MODAL ════════════════════════════════════════ */}
      {(importColleaguesPreview || importColleaguesSaving || importColleaguesResult || importColleaguesError) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 50%)", backdropFilter: "blur(4px)" }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div>
                <p className="font-semibold text-foreground text-[15px]">Importar compañeros</p>
                {importColleaguesPreview && (
                  <p className="text-[12px] text-muted-foreground">{importColleaguesPreview.length} personas detectadas</p>
                )}
              </div>
              <button onClick={() => { setImportColleaguesPreview(null); setImportColleaguesResult(null); setImportColleaguesError("") }}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {importColleaguesResult ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                    style={{ background: "oklch(0.52 0.13 165 / 0.12)" }}>✓</div>
                  <p className="font-semibold text-foreground text-[15px]">
                    {importColleaguesResult.ok} compañero{importColleaguesResult.ok !== 1 ? "s" : ""} importado{importColleaguesResult.ok !== 1 ? "s" : ""}
                  </p>
                  {importColleaguesResult.fail > 0 && (
                    <p className="text-[13px] text-muted-foreground">{importColleaguesResult.fail} fallaron</p>
                  )}
                </div>
              ) : importColleaguesPreview ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-2 pr-4 font-semibold text-muted-foreground uppercase tracking-wide">#</th>
                        <th className="pb-2 pr-4 font-semibold text-muted-foreground uppercase tracking-wide">Nombre</th>
                        <th className="pb-2 pr-4 font-semibold text-muted-foreground uppercase tracking-wide">Correo</th>
                        <th className="pb-2 pr-4 font-semibold text-muted-foreground uppercase tracking-wide">WhatsApp</th>
                        <th className="pb-2 font-semibold text-muted-foreground uppercase tracking-wide">Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importColleaguesPreview.map((c, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-4 font-medium text-foreground">{c.nombre || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{c.email || "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{c.whatsapp || "—"}</td>
                          <td className="py-2 text-muted-foreground text-[11px]">{c.notas || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {importColleaguesError && (
                <p className="text-[13px] font-medium" style={{ color: "oklch(0.60 0.22 27)" }}>{importColleaguesError}</p>
              )}
            </div>

            {importColleaguesPreview && !importColleaguesSaving && (
              <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
                <button onClick={handleConfirmImportColleagues}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.44 0.14 185))", boxShadow: "0 4px 14px oklch(0.52 0.13 165 / 30%)" }}>
                  Importar {importColleaguesPreview.length} compañeros
                </button>
                <button onClick={() => { setImportColleaguesPreview(null); setImportColleaguesError("") }}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              </div>
            )}
            {importColleaguesSaving && (
              <div className="px-5 py-4 border-t border-border flex-shrink-0">
                <p className="text-[13px] text-muted-foreground">Guardando…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ IMPORT MODAL ════════════════════════════════════════════════════ */}
      {(importPreview || importLoading || importError || importSuccessCount != null) && importingEquipoId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 50%)", backdropFilter: "blur(4px)" }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="font-semibold text-foreground text-[15px]">Importar participantes</p>
                <p className="text-[12px] text-muted-foreground">
                  {equipos.find(e => e.id === importingEquipoId)?.nombre || "Grupo"}
                </p>
              </div>
              <button onClick={() => { setImportPreview(null); setImportingEquipoId(null); setImportError(""); setImportSuccessCount(null) }}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {importSuccessCount != null && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                    style={{ background: "oklch(0.55 0.18 145 / 0.15)" }}>✓</div>
                  <p className="font-semibold text-foreground text-[15px]">¡Importación exitosa!</p>
                  <p className="text-[13px] text-muted-foreground">
                    Se guardaron <span className="font-bold text-foreground">{importSuccessCount}</span> participantes.
                  </p>
                </div>
              )}
              {importLoading && (
                <p className="text-[13px] text-muted-foreground text-center py-6">Leyendo archivo…</p>
              )}
              {importError && (
                <p className="text-[13px] text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{importError}</p>
              )}
              {importPreview && (
                <>
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{importPreview.length}</span> participantes encontrados:
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-border max-h-64 overflow-y-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0">
                        <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nombre</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Teléfono</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Correo</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((c, i) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 text-foreground">{c.nombre || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.telefono || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{c.correo || "—"}</td>
                            <td className="px-2 py-2">
                              <button onClick={() => setImportPreview(prev => prev.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive transition-colors">
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            {importPreview && (
              <div className="px-5 py-4 border-t border-border flex gap-2 justify-between items-center">
                <span className="text-[12px] text-muted-foreground">
                  {importPreview.length === 0
                    ? "Lista vacía"
                    : `${importPreview.length} contacto${importPreview.length !== 1 ? "s" : ""} listos`}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => { setImportPreview(null); setImportingEquipoId(null); setImportError("") }}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleConfirmImport} disabled={importSaving || importPreview.length === 0}>
                    {importSaving ? "Guardando…" : `Importar ${importPreview.length}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <input ref={contactsInputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleContactsFileSelected} />
      <Tutorial userEmail={user?.email} forceOpen={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  )
}
