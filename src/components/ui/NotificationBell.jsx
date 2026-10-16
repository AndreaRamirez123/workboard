import { useState, useEffect, useRef } from "react"
import { Bell } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { collection, query, orderBy, onSnapshot, limit, where, Timestamp } from "firebase/firestore"
import { db } from "@/services/firebase"

const ICONS = {
  tarea_asignada:      "📋",
  tarea_grupo:         "📋",
  tarea_vencimiento:   "⏰",
  feedback_grupo:      "💬",
  feedback_recibido:   "💬",
  proyecto_agregado:   "🗂️",
  licencia:            "🗓️",
  general:             "🔔",
}

const storageKey = (type, id) => `wb_read_${type}_${id}`

const getReadIds = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")) }
  catch { return new Set() }
}

const saveReadIds = (key, set) => {
  localStorage.setItem(key, JSON.stringify([...set]))
}

export function NotificationBell({ isAdmin, myColleagueId, userEmail, userUid, semilleroId }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const key = isAdmin
    ? storageKey("logs", userEmail)
    : storageKey("fb", myColleagueId)
  const keyNotif = storageKey("notif", userEmail || "guest")
  const keyUserNotif = storageKey("unotif", userUid || "guest")

  // ── Listener en tiempo real ─────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin && !myColleagueId) return

    const unsubs = []

    // Últimos 30 días
    const cutoff = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

    if (isAdmin) {
      // Notas del equipo — solo últimos 30 días, máx 40
      const qLogs = query(
        collection(db, "logs"),
        where("createdAt", ">=", cutoff),
        orderBy("createdAt", "desc"),
        limit(40)
      )
      unsubs.push(onSnapshot(qLogs, (snap) => {
        const readIds = getReadIds(key)
        const fresh = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(doc => !semilleroId || doc.semilleroId === semilleroId)
          .filter(doc => !readIds.has(doc.id))
          .map(doc => {
            const isProyecto = doc.tipo === "proyecto_agregado"
            return {
              id: doc.id,
              source: "log",
              text: isProyecto
                ? `${doc.colleagueName || "Alguien"} agregó un proyecto`
                : `${doc.colleagueName || "Alguien"} agregó una nota`,
              sub: doc.nota?.slice(0, 70) + (doc.nota?.length > 70 ? "…" : ""),
              date: doc.createdAt?.toDate?.(),
              href: `/semillero/${semilleroId}/colleague/${doc.colleagueId}`,
              dot: isProyecto ? "oklch(0.58 0.16 295)" : "oklch(0.60 0.22 27)",
            }
          })
        setItems(prev => [...prev.filter(i => i.source !== "log"), ...fresh])
      }, () => {}))

      // Tareas completadas al 100% — solo últimos 30 días
      const qNotif = query(
        collection(db, "notificaciones"),
        where("createdAt", ">=", cutoff),
        orderBy("createdAt", "desc"),
        limit(20)
      )
      unsubs.push(onSnapshot(qNotif, (snap) => {
        const readIds = getReadIds(keyNotif)
        const fresh = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(doc => !semilleroId || doc.semilleroId === semilleroId)
          .filter(doc => !readIds.has(doc.id))
          .map(doc => {
            const quien = doc.assigneeName || doc.grupoNombre || "Un miembro"
            return {
              id: doc.id,
              source: "notif",
              text: `✓ Tarea completada al 100%`,
              sub: `"${doc.taskTitle}" · ${quien}`,
              date: doc.createdAt?.toDate?.(),
              href: doc.path || `/semillero/${semilleroId}/dashboard`,
              dot: "oklch(0.55 0.18 145)",
            }
          })
        setItems(prev => [...prev.filter(i => i.source !== "notif"), ...fresh])
      }, () => {}))

      // Notificaciones personales para admin — filtradas por semilleroId
      if (userUid) {
        const qU = query(collection(db, "notif_usuario", userUid, "items"), orderBy("createdAt", "desc"))
        unsubs.push(onSnapshot(qU, (snap) => {
          const readIds = getReadIds(keyUserNotif)
          const fresh = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(doc => !semilleroId || doc.semilleroId === semilleroId)
            .filter(doc => !readIds.has(doc.id))
            .map(doc => ({
              id: doc.id,
              source: "unotif",
              text: doc.titulo || "Nueva notificación",
              sub: doc.subtitulo || null,
              date: doc.createdAt?.toDate?.(),
              href: doc.path || `/semillero/${semilleroId}/dashboard`,
              dot: "oklch(0.55 0.18 260)",
            }))
          setItems(prev => [...prev.filter(i => i.source !== "unotif"), ...fresh])
        }, () => {}))
      }
    } else {
      // Retroalimentación individual
      const q = query(
        collection(db, "companeros", myColleagueId, "retroalimentacion"),
        orderBy("createdAt", "desc")
      )
      unsubs.push(onSnapshot(q, (snap) => {
        const readIds = getReadIds(key)
        const fresh = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(doc => !readIds.has(doc.id))
          .map(doc => ({
            id: doc.id,
            source: "fb",
            text: `${doc.creadoPorNombre || "Admin"} te dejó retroalimentación`,
            sub: doc.texto?.slice(0, 70) + (doc.texto?.length > 70 ? "…" : ""),
            date: doc.createdAt?.toDate?.(),
            href: `/semillero/${semilleroId}/colleague/${myColleagueId}`,
            dot: "oklch(0.60 0.22 27)",
          }))
        setItems(prev => [...prev.filter(i => i.source !== "fb"), ...fresh])
      }, () => {}))

      // Notificaciones personales (tareas, feedback grupo, etc.) — filtradas por semilleroId
      if (userUid) {
        const qU = query(
          collection(db, "notif_usuario", userUid, "items"),
          orderBy("createdAt", "desc")
        )
        unsubs.push(onSnapshot(qU, (snap) => {
          const readIds = getReadIds(keyUserNotif)
          const fresh = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(doc => !semilleroId || doc.semilleroId === semilleroId)
            .filter(doc => !readIds.has(doc.id))
            .map(doc => ({
              id: doc.id,
              source: "unotif",
              text: doc.titulo || "Nueva notificación",
              sub: doc.subtitulo || null,
              date: doc.createdAt?.toDate?.(),
              href: doc.path || `/semillero/${semilleroId}/dashboard`,
              dot: (doc.tipo === "feedback_grupo" || doc.tipo === "feedback_recibido")
                ? "oklch(0.60 0.22 27)"
                : "oklch(0.55 0.18 260)",
            }))
          setItems(prev => [...prev.filter(i => i.source !== "unotif"), ...fresh])
        }, () => {}))
      }
    }

    return () => unsubs.forEach(u => u())
  }, [isAdmin, myColleagueId, userUid, semilleroId, key, keyNotif, keyUserNotif])

  const sourceKey = (source) => {
    if (source === "notif") return keyNotif
    if (source === "unotif") return keyUserNotif
    return key
  }

  const markOne = (id, source) => {
    const k = sourceKey(source)
    const readIds = getReadIds(k)
    readIds.add(id)
    saveReadIds(k, readIds)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const markAll = () => {
    const grouped = {}
    items.forEach(i => {
      const k = sourceKey(i.source)
      if (!grouped[k]) grouped[k] = getReadIds(k)
      grouped[k].add(i.id)
    })
    Object.entries(grouped).forEach(([k, set]) => saveReadIds(k, set))
    setItems([])
  }

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const count = items.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        title={isAdmin ? "Actividad del equipo" : "Mis notificaciones"}
      >
        <Bell size={16} className={count > 0 ? "text-foreground" : "text-muted-foreground"} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "var(--destructive)", color: "oklch(0.99 0 0)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-popover border border-border rounded-2xl z-50 overflow-hidden"
          style={{ boxShadow: "0 24px 60px oklch(0 0 0 / 22%), 0 0 0 1px oklch(0 0 0 / 6%)" }}>

          <div className="px-4 py-3 border-b border-border flex justify-between items-center">
            <p className="text-[13px] font-semibold text-foreground">
              {isAdmin ? "Actividad del equipo" : "Notificaciones"}
            </p>
            {count > 0 && (
              <button onClick={markAll}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {count === 0 ? (
              <div className="py-8 text-center">
                <Bell size={20} className="text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-[13px] text-muted-foreground">Sin notificaciones nuevas</p>
              </div>
            ) : (
              [...items].sort((a, b) => (b.date || 0) - (a.date || 0)).map(n => (
                <a key={n.id} href={n.href}
                  onClick={() => markOne(n.id, n.source)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                  <div className="w-1.5 h-1.5 rounded-full mt-[6px] flex-shrink-0"
                    style={{ backgroundColor: n.dot || "oklch(0.60 0.22 27)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground leading-snug font-medium">{n.text}</p>
                    {n.sub && (
                      <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{n.sub}</p>
                    )}
                    {n.date && (
                      <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                        {format(n.date, "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                      </p>
                    )}
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
