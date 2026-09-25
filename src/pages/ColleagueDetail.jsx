import { useEffect, useState, useRef, useMemo } from "react"
import { downloadFile } from "@/utils/download"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from "firebase/firestore"
import { db } from "@/services/firebase"
import { deleteColleague, deleteProject, updateProject } from "@/services/colleagues.service"
import { extractPdfText, parseCunPdf } from "@/utils/parsePropuesta"
import { getGrupos, addGrupoProject } from "@/services/groups.service"
import { addLog, getLogs, deleteLog, updateLog } from "@/services/logs.service"
import { addFeedback, getFeedback, deleteFeedback, updateFeedback } from "@/services/feedback.service"
import { addTask, getTasks, updateTask, updateTaskStatus, deleteTask, updateTaskAvance, addTaskFile, removeTaskFile, solicitarPlazoTask, cancelarPlazoTask, aceptarPlazoTask, rechazarPlazoTask, dismissPlazoResultadoTask } from "@/services/tasks.service"
import { notificarTareaCompletada, crearNotificacionUsuario } from "@/services/notificaciones.service"
import { queueTareaNotification } from "@/services/wpp.service"
import { uploadTaskFile, deleteTaskFile, uploadAttachment, MAX_FILE_SIZE } from "@/services/storage.service"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import EmojiPicker from "emoji-picker-react"
import { Footer } from "@/components/ui/Footer"



function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function deadlineStatus(fechaEntrega) {
  const deadline = parseLocalDate(fechaEntrega)
  if (!deadline) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.ceil((deadline - today) / 86400000)
  if (diff < 0)  return { label: "Vencido",      color: "oklch(0.65 0.22 27)",  bg: "oklch(0.65 0.22 27 / 0.12)"  }
  if (diff === 0) return { label: "Vence hoy",    color: "oklch(0.70 0.20 55)",  bg: "oklch(0.70 0.20 55 / 0.12)"  }
  if (diff <= 7)  return { label: `${diff}d`,     color: "oklch(0.70 0.18 60)",  bg: "oklch(0.70 0.18 60 / 0.12)"  }
  return            { label: `${diff}d restantes`, color: "oklch(0.60 0.18 145)", bg: "oklch(0.60 0.18 145 / 0.12)" }
}

const PROJECT_STATE_STYLE = {
  "Formulación":   { color: "oklch(0.62 0.18 260)", bg: "oklch(0.62 0.18 260 / 0.12)" },
  "En ejecución":  { color: "oklch(0.60 0.18 290)", bg: "oklch(0.60 0.18 290 / 0.12)" },
  "En evaluación": { color: "oklch(0.68 0.18 55)",  bg: "oklch(0.68 0.18 55 / 0.12)"  },
  "Finalizado":    { color: "oklch(0.60 0.18 145)", bg: "oklch(0.60 0.18 145 / 0.12)" },
  "Suspendido":    { color: "oklch(0.55 0.04 270)", bg: "oklch(0.55 0.04 270 / 0.12)" },
}

const VERSION_STATE_STYLE = {
  "Pendiente": { color: "oklch(0.55 0.04 270)", bg: "oklch(0.55 0.04 270 / 0.12)" },
  "En curso":  { color: "oklch(0.62 0.18 260)", bg: "oklch(0.62 0.18 260 / 0.12)" },
  "Entregado": { color: "oklch(0.60 0.18 145)", bg: "oklch(0.60 0.18 145 / 0.12)" },
  "Cancelado": { color: "oklch(0.65 0.22 27)",  bg: "oklch(0.65 0.22 27 / 0.12)"  },
}

function getFileTypeInfo(tipo, nombre) {
  const ext = (nombre || "").split(".").pop().toLowerCase()
  if (tipo?.includes("pdf") || ext === "pdf")
    return { label: "PDF", color: "oklch(0.50 0.22 27)",  bg: "oklch(0.65 0.22 27 / 0.15)"  }
  if (tipo?.includes("word") || ["doc","docx"].includes(ext))
    return { label: "DOC", color: "oklch(0.50 0.20 260)", bg: "oklch(0.62 0.18 260 / 0.15)" }
  if (tipo?.includes("sheet") || tipo?.includes("excel") || ["xls","xlsx"].includes(ext))
    return { label: "XLS", color: "oklch(0.50 0.18 145)", bg: "oklch(0.55 0.18 145 / 0.15)" }
  if (tipo?.includes("presentation") || ["ppt","pptx"].includes(ext))
    return { label: "PPT", color: "oklch(0.55 0.22 35)",  bg: "oklch(0.65 0.20 35 / 0.15)"  }
  if (tipo?.includes("image") || ["jpg","jpeg","png","gif","webp"].includes(ext))
    return { label: "IMG", color: "oklch(0.50 0.18 295)", bg: "oklch(0.62 0.18 295 / 0.15)" }
  return                  { label: "FILE", color: "oklch(0.55 0.04 270)", bg: "oklch(0.55 0.04 270 / 0.15)" }
}

function formatFileSize(bytes) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ESTADO_AVANCE = {
  "Formulación": 10,
  "En ejecución": 50,
  "En evaluación": 80,
  "Finalizado": 100,
  "Suspendido": 0,
}

function getAvance(proyecto) {
  return ESTADO_AVANCE[proyecto.estado] ?? 0
}

export default function ColleagueDetail() {
  const { id, semilleroId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, myColleagueId, isAdmin, isSuperAdmin } = useAuth()
  const isOwn = id === myColleagueId

  const [companero, setCompanero] = useState(null)
  const [logs, setLogs] = useState([])
  const [grupos, setGrupos] = useState([])
  const [enrutandoProyecto, setEnrutandoProyecto] = useState(null)
  const [grupoSeleccionado, setGrupoSeleccionado] = useState("")
  const [savingEnrute, setSavingEnrute] = useState(false)
  const [nota, setNota] = useState("")
  const [saving, setSaving] = useState(false)
  const [editingLogId, setEditingLogId] = useState(null)
  const [editingLogText, setEditingLogText] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [projectSearch, setProjectSearch] = useState("")
  const [logSearch, setLogSearch] = useState("")
  const [logSelectMode, setLogSelectMode] = useState(false)
  const [selectedLogIds, setSelectedLogIds] = useState(new Set())
  const notaRef = useRef(null)

  const [feedback, setFeedback] = useState([])
  const [feedbackText, setFeedbackText] = useState("")
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [editingFbId, setEditingFbId] = useState(null)
  const [editingFbText, setEditingFbText] = useState("")

  const [tasks, setTasks] = useState([])
  const [taskForm, setTaskForm] = useState({ titulo: "", descripcion: "", fechaInicio: "", fechaLimite: "", avance: 0 })
  const [savingTask, setSavingTask] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTaskForm, setEditingTaskForm] = useState({})
  const [solicitudMotivo, setSolicitudMotivo] = useState("")
  const [solicitudFecha, setSolicitudFecha] = useState("")
  const [savingSolicitud, setSavingSolicitud] = useState(false)
  const [editandoSolicitudId, setEditandoSolicitudId] = useState(null)
  const [aceptandoPlazoId, setAceptandoPlazoId] = useState(null)
  const [fechaAceptar, setFechaAceptar] = useState("")
  const [savingPlazo, setSavingPlazo] = useState(false)
  const [taskAvanceLocal, setTaskAvanceLocal] = useState({})
  const [savingAvance, setSavingAvance] = useState(null)
  const [openTaskFiles, setOpenTaskFiles] = useState(new Set())
  const [taskFileProgress, setTaskFileProgress] = useState(null)
  const [taskFileError, setTaskFileError] = useState("")

  const taskFileInputRef = useRef(null)
  const uploadingTaskIdRef = useRef(null)

  // ── Inline project form state ─────────────────────────────────────────────
  const PROJ_ESTADOS = ["Formulación", "En ejecución", "En evaluación", "Finalizado", "Suspendido"]
  const emptyProjectForm = { nombre: "", estado: "En ejecución", area: "", herramientas: "", queHace: "", observaciones: "", fechaInicio: "", fechaEntrega: "", archivos: [] }
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [projectForm, setProjectForm] = useState(emptyProjectForm)
  const [savingProject, setSavingProject] = useState(false)
  const [projectSaveError, setProjectSaveError] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [pdfImported, setPdfImported] = useState(false)
  const pdfInputRef = useRef(null)
  const projAttachRef = useRef(null)
  const taskAttachRef = useRef(null)
  const logAttachRef  = useRef(null)
  const [projAttachUploading, setProjAttachUploading] = useState(false)
  const [taskAttachFiles, setTaskAttachFiles] = useState([])
  const [taskAttachUploading, setTaskAttachUploading] = useState(false)
  const [logAttachFiles, setLogAttachFiles] = useState([])
  const [logAttachUploading, setLogAttachUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null) // { url, nombre }

  const handleAttachFile = async (file, basePath, onAdd, setUploading) => {
    if (file.size > MAX_FILE_SIZE) { alert(`El archivo supera los 15 MB.`); return }
    setUploading(true)
    try {
      const meta = await uploadAttachment(basePath, file)
      onAdd(meta)
    } catch { alert("No se pudo subir el archivo.") }
    finally { setUploading(false) }
  }

  // Auto-open edit form when arriving from global projects view
  useEffect(() => {
    const target = location.state?.openProjectEdit
    if (!target || !companero) return
    const proyecto = (companero.proyectos || []).find(p => p.nombre === target)
    if (!proyecto) return
    setEditingProject(proyecto)
    setProjectForm({
      nombre: proyecto.nombre || "",
      estado: proyecto.estado || "En ejecución",
      area: proyecto.area || "",
      herramientas: Array.isArray(proyecto.herramientas) ? proyecto.herramientas.join(", ") : (proyecto.herramientas || ""),
      queHace: proyecto.queHace || "",
      observaciones: proyecto.observaciones || "",
      fechaInicio: proyecto.fechaInicio || "",
      fechaEntrega: proyecto.fechaEntrega || "",
    })
    setShowProjectForm(true)
    setPdfImported(false)
    setPdfError(null)
  }, [companero, location.state])

  const handlePdfImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setPdfError(null); setPdfImported(false); setPdfLoading(true)
    try {
      const rawText = await extractPdfText(file)
      const fields = parseCunPdf(rawText)
      if (Object.keys(fields).length === 0) { setPdfError("No se reconoció el formato del PDF."); return }

      // Subir el PDF como adjunto para que quede visible en la actividad
      const proyNombre = (fields.nombre || "propuesta").replace(/[^a-zA-Z0-9]/g, "_")
      let pdfMeta = null
      try {
        pdfMeta = await uploadAttachment(`proyectos/${id}/${proyNombre}`, file)
      } catch { /* si falla el upload no bloqueamos el import */ }

      setProjectForm(prev => ({
        ...prev,
        nombre: fields.nombre || prev.nombre,
        area: fields.area || prev.area,
        queHace: fields.queHace || prev.queHace,
        herramientas: Array.isArray(fields.herramientas) ? fields.herramientas.join(", ") : (fields.herramientas || prev.herramientas),
        fechaInicio: fields.fechaInicio || prev.fechaInicio,
        fechaEntrega: fields.fechaEntrega || prev.fechaEntrega,
        archivos: pdfMeta ? [...(prev.archivos || []), pdfMeta] : (prev.archivos || []),
      }))
      setPdfImported(true)
    } catch { setPdfError("No se pudo leer el archivo.") }
    finally { setPdfLoading(false) }
  }

  const handleSaveProject = async () => {
    if (!projectForm.nombre.trim()) return
    setSavingProject(true); setProjectSaveError(null)
    const proyecto = {
      nombre: projectForm.nombre.trim(),
      estado: projectForm.estado,
      avance: editingProject?.avance ?? 0,
      area: projectForm.area.trim(),
      queHace: projectForm.queHace.trim(),
      herramientas: projectForm.herramientas.split(",").map(h => h.trim()).filter(Boolean),
      observaciones: projectForm.observaciones.trim(),
      fechaInicio: projectForm.fechaInicio,
      fechaEntrega: projectForm.fechaEntrega,
      archivos: projectForm.archivos || [],
    }
    try {
      if (editingProject) {
        await updateProject(id, editingProject, proyecto)
      } else {
        await updateDoc(doc(db, "companeros", id), { proyectos: arrayUnion(proyecto) })
      }
      const snap = await getDoc(doc(db, "companeros", id))
      setCompanero(snap.data())
      setShowProjectForm(false); setEditingProject(null); setProjectForm(emptyProjectForm); setPdfImported(false)
    } catch (err) { setProjectSaveError("Error al guardar. Intenta de nuevo.") }
    finally { setSavingProject(false) }
  }

  // isOwnProfile: true si el uid del companero cargado coincide con el usuario actual.
  // Esto cubre el caso en que myColleagueId no esté sincronizado (ej: superadmins).
  const isOwnProfile = useMemo(
    () => isOwn || (!!companero?.uid && companero.uid === user?.uid),
    [isOwn, companero?.uid, user?.uid]
  )
  // canEdit: dueño del perfil (por cualquier método) o superadmin
  const canEdit = isOwnProfile || isSuperAdmin

  // ── Navegación ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("proyectos")
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const loadData = async () => {
    const snap = await getDoc(doc(db, "companeros", id))
    if (snap.exists()) setCompanero({ id: snap.id, ...snap.data() })
    setLogs(await getLogs(id))
  }

  useEffect(() => {
    loadData()
    getGrupos().then(setGrupos)
  }, [id])

  useEffect(() => {
    if (isOwnProfile || isAdmin) getFeedback(id).then(setFeedback)
  }, [id, isOwnProfile, isAdmin])

  useEffect(() => {
    if (isOwnProfile || isAdmin) getTasks(id).then(setTasks)
  }, [id, isOwnProfile, isAdmin])

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!taskForm.titulo.trim()) return
    setSavingTask(true)
    try {
      const taskRef = await addTask(id, taskForm, user)
      if (taskAttachFiles.length > 0 && taskRef?.id) {
        await updateDoc(doc(db, "companeros", id, "tareas", taskRef.id), { archivos: arrayUnion(...taskAttachFiles) }).catch(() => {})
      }
      setTaskAttachFiles([])
      if (Number(taskForm.avance) >= 100) {
        notificarTareaCompletada({ taskTitle: taskForm.titulo.trim(), assigneeName: companero?.nombre || id, path: `/semillero/${semilleroId}/colleague/${id}`, semilleroId }).catch(() => {})
      }
      if (companero?.whatsapp) {
        queueTareaNotification({
          colleague: companero,
          tarea: taskForm,
          asignadoPor: user?.displayName || user?.email || "Admin",
        }).catch(() => {})
      }
      // Notificación in-app al compañero
      if (companero?.uid) {
        crearNotificacionUsuario({
          toUid: companero.uid,
          tipo: "tarea_asignada",
          titulo: "Te asignaron una nueva tarea",
          subtitulo: taskForm.titulo.trim(),
          path: `/semillero/${semilleroId}/colleague/${id}`,
          semilleroId,
        }).catch(() => {})
      }
      setTaskForm({ titulo: "", descripcion: "", fechaInicio: "", fechaLimite: "", avance: 0 })
      setShowTaskForm(false)
      setTasks(await getTasks(id))
    } catch (err) {
      console.error("[Workboard] Error creando tarea:", err.code, err.message)
    }
    setSavingTask(false)
  }

  const handleUpdateTaskStatus = async (taskId, nuevoEstado) => {
    try {
      await updateTaskStatus(id, taskId, nuevoEstado)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, estado: nuevoEstado } : t))
      if (nuevoEstado === "Hecha") {
        const task = tasks.find(t => t.id === taskId)
        notificarTareaCompletada({
          taskTitle: task?.titulo,
          assigneeName: companero?.nombre || id,
          path: `/semillero/${semilleroId}/colleague/${id}`,
          semilleroId,
        }).catch(() => {})
      }
    } catch (err) {
      console.error("[Workboard] Error actualizando tarea:", err.code, err.message)
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!confirm("¿Eliminar esta tarea?")) return
    try {
      await deleteTask(id, taskId)
      setTasks(await getTasks(id))
    } catch (err) {
      console.error("[Workboard] Error eliminando tarea:", err.code, err.message)
    }
  }

  const handleSaveEditTask = async (task) => {
    if (!editingTaskForm.titulo?.trim()) return
    const prevAvance = task.avance ?? 0
    const newAvance = Number(editingTaskForm.avance) || 0
    const data = {
      titulo: editingTaskForm.titulo.trim(),
      descripcion: editingTaskForm.descripcion?.trim() || "",
      fechaInicio: editingTaskForm.fechaInicio || null,
      fechaLimite: editingTaskForm.fechaLimite || null,
      avance: newAvance,
    }
    try {
      await updateTask(id, task.id, data)
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...data } : t))
      if (prevAvance < 100 && newAvance >= 100) {
        notificarTareaCompletada({ taskTitle: data.titulo, assigneeName: colleague?.nombre || id, path: `/semillero/${semilleroId}/colleague/${id}`, semilleroId }).catch(() => {})
      }
      setEditingTaskId(null)
    } catch (err) {
      console.error("[Workboard] Error editando tarea:", err.code, err.message)
    }
  }

  const handleSolicitarPlazo = async (taskId) => {
    if (!solicitudMotivo.trim()) return
    setSavingSolicitud(true)
    try {
      await solicitarPlazoTask(id, taskId, {
        motivo: solicitudMotivo.trim(),
        fechaPropuesta: solicitudFecha || null,
        solicitadoPor: companero?.nombre || user?.displayName || user?.email,
        fecha: new Date().toISOString(),
      })
      setEditingTaskId(null)
      setSolicitudMotivo("")
      setSolicitudFecha("")
      setTasks(await getTasks(id))
    } catch (err) {
      console.error("[Workboard] Error solicitando plazo:", err.code, err.message)
    } finally {
      setSavingSolicitud(false)
    }
  }

  const handleAceptarPlazo = async (task) => {
    const fechaPropuesta = task.solicitudPlazo?.fechaPropuesta
    if (!fechaPropuesta && !fechaAceptar) {
      setAceptandoPlazoId(task.id)
      setFechaAceptar("")
      return
    }
    setSavingPlazo(true)
    try {
      await aceptarPlazoTask(id, task.id, fechaPropuesta || fechaAceptar)
      setAceptandoPlazoId(null)
      setFechaAceptar("")
      setTasks(await getTasks(id))
    } catch (err) {
      console.error("[Workboard] Error aceptando plazo:", err)
    } finally {
      setSavingPlazo(false)
    }
  }

  const handleRechazarPlazo = async (taskId) => {
    setSavingPlazo(true)
    try {
      await rechazarPlazoTask(id, taskId)
      setTasks(await getTasks(id))
    } catch (err) {
      console.error("[Workboard] Error rechazando plazo:", err)
    } finally {
      setSavingPlazo(false)
    }
  }

  const handleUpdateAvance = async (taskId, newAvance) => {
    setSavingAvance(taskId)
    try {
      const task = tasks.find(t => t.id === taskId)
      const nuevoEstado = newAvance >= 100 ? "Hecha" : undefined
      await updateTaskAvance(id, taskId, newAvance, nuevoEstado)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, avance: newAvance, ...(nuevoEstado ? { estado: nuevoEstado } : {}) } : t))
      if (newAvance >= 100 && task?.estado !== "Hecha") {
        notificarTareaCompletada({ taskTitle: task?.titulo, assigneeName: companero?.nombre || id, path: `/semillero/${semilleroId}/colleague/${id}`, semilleroId }).catch(() => {})
      }
    } catch (err) {
      console.error("[Workboard] Error actualizando avance:", err)
    } finally {
      setSavingAvance(null)
      setTaskAvanceLocal(prev => { const n = { ...prev }; delete n[taskId]; return n })
    }
  }

  const handleTaskFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const taskId = uploadingTaskIdRef.current
    if (!taskId) return
    if (file.size > MAX_FILE_SIZE) { setTaskFileError("El archivo supera 15 MB."); return }
    setTaskFileError("")
    setTaskFileProgress({ taskId, progress: 0 })
    try {
      const archivo = await uploadTaskFile(id, taskId, file, { onProgress: p => setTaskFileProgress({ taskId, progress: p }) })
      await addTaskFile(id, taskId, archivo)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, archivos: [...(t.archivos || []), archivo] } : t))
    } catch (err) {
      console.error("[Workboard] Error subiendo archivo de tarea:", err)
      setTaskFileError("Error al subir el archivo.")
    } finally {
      setTaskFileProgress(null)
      uploadingTaskIdRef.current = null
    }
  }

  const handleDeleteProjectFile = async (proyecto, archivo) => {
    if (!window.confirm(`¿Eliminar "${archivo.nombre}"?`)) return
    try {
      if (archivo.storagePath) await deleteTaskFile(archivo.storagePath)
      const updated = { ...proyecto, archivos: (proyecto.archivos || []).filter(a => a.storagePath !== archivo.storagePath) }
      await updateProject(id, proyecto, updated)
      setCompanero(prev => ({
        ...prev,
        proyectos: (prev.proyectos || []).map(p =>
          p.nombre === proyecto.nombre && p.fechaInicio === proyecto.fechaInicio ? updated : p
        )
      }))
    } catch (err) {
      console.error("[Workboard] Error eliminando archivo de actividad:", err)
    }
  }

  const handleDeleteTaskFile = async (taskId, archivo) => {
    if (!window.confirm(`¿Eliminar "${archivo.nombre}"?`)) return
    try {
      await deleteTaskFile(archivo.storagePath)
      await removeTaskFile(id, taskId, archivo)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, archivos: (t.archivos || []).filter(a => a.storagePath !== archivo.storagePath) } : t))
    } catch (err) {
      console.error("[Workboard] Error eliminando archivo de tarea:", err)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar a ${companero.nombre}? No se puede deshacer.`)) return
    await deleteColleague(id)
    navigate(`/semillero/${semilleroId}/dashboard`)
  }

  const handleDeleteProject = async (proyecto) => {
    if (!confirm(`¿Eliminar la actividad "${proyecto.nombre}"?`)) return
    await deleteProject(id, proyecto)
    loadData()
  }

  const handleEnrutarProyecto = async () => {
    if (!grupoSeleccionado || !enrutandoProyecto) return
    setSavingEnrute(true)
    try {
      await addGrupoProject(grupoSeleccionado, { ...enrutandoProyecto, enrutadoDe: id })
      setEnrutandoProyecto(null)
      setGrupoSeleccionado("")
      loadData()
    } catch (err) {
      console.error("[Workboard] Error enrutando proyecto:", err)
    } finally {
      setSavingEnrute(false)
    }
  }

  const handleAddLog = async (e) => {
    e.preventDefault()
    if (!nota.trim()) return
    setSaving(true)
    await addLog({ colleagueId: id, colleagueName: companero.nombre, nota, userId: user.uid, semilleroId, archivos: logAttachFiles })
    setNota("")
    setLogAttachFiles([])
    setLogs(await getLogs(id))
    setSaving(false)
  }

  const handleDeleteLog = async (logId) => {
    if (!confirm("¿Eliminar esta nota?")) return
    await deleteLog(logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  const handleEmojiClick = (emojiData) => {
    const el = notaRef.current
    const start = el.selectionStart
    const end = el.selectionEnd
    const newText = nota.substring(0, start) + emojiData.emoji + nota.substring(end)
    setNota(newText)
    setShowEmoji(false)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + emojiData.emoji.length
      el.selectionEnd = start + emojiData.emoji.length
    }, 0)
  }

  const handleStartEditLog = (log) => {
    setEditingLogId(log.id)
    setEditingLogText(log.nota)
  }

  const handleSaveEditLog = async (logId) => {
    if (!editingLogText.trim()) return
    await updateLog(logId, editingLogText.trim())
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, nota: editingLogText.trim() } : l))
    setEditingLogId(null)
  }

  const handleAddFeedback = async (e) => {
    e.preventDefault()
    if (!feedbackText.trim()) return
    setSavingFeedback(true)
    await addFeedback(id, feedbackText.trim(), user)
    if (companero?.uid) {
      crearNotificacionUsuario({
        toUid: companero.uid,
        tipo: "feedback_recibido",
        titulo: "Tienes nueva retroalimentación",
        subtitulo: feedbackText.trim().slice(0, 80),
        path: `/semillero/${semilleroId}/colleague/${id}`,
        semilleroId,
      }).catch(() => {})
    }
    setFeedbackText("")
    setFeedback(await getFeedback(id))
    setSavingFeedback(false)
  }

  const handleDeleteFeedback = async (fbId) => {
    if (!confirm("¿Eliminar esta retroalimentación?")) return
    try {
      await deleteFeedback(id, fbId)
      setFeedback(await getFeedback(id))
    } catch (err) {
      console.error("[Workboard] Error eliminando retroalimentación:", err.code, err.message)
    }
  }

  const handleSaveEditFeedback = async (fbId) => {
    if (!editingFbText.trim()) return
    await updateFeedback(id, fbId, editingFbText.trim())
    setFeedback(prev => prev.map(f => f.id === fbId ? { ...f, texto: editingFbText.trim() } : f))
    setEditingFbId(null)
  }

  if (!companero) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Cargando…</p>
    </div>
  )

  const profileHue = companero?.colorHue ?? 165
  const profileHue2 = companero?.colorHue2 ?? null
  const profileGradient = (h1, h2End) =>
    `linear-gradient(135deg, oklch(0.62 0.18 ${h1}), oklch(0.54 0.22 ${profileHue2 ?? h2End}))`

  return (
    <div className="min-h-screen bg-background flex">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "oklch(0 0 0 / 45%)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-border/50
          transition-transform duration-300 ease-in-out lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 272, background: "var(--sidebar)" }}>

        {/* Volver */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0">
          <button onClick={() => { navigate(`/semillero/${semilleroId}/dashboard`); setSidebarOpen(false) }}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            ← Volver al equipo
          </button>
        </div>

        <div className="mx-4 h-px bg-border/60 flex-shrink-0" />

        {/* Avatar + nombre + rol */}
        <div className="px-5 py-6 flex-shrink-0 text-center">
          <div className="w-[84px] h-[84px] rounded-2xl flex items-center justify-center text-white font-bold text-3xl overflow-hidden mx-auto mb-3"
            style={{
              background: companero.avatarUrl ? "var(--muted)" : profileGradient(profileHue, (profileHue + 40) % 360),
              boxShadow: `0 8px 28px oklch(0.52 0.18 ${profileHue} / 30%)`,
            }}>
            {companero.avatarUrl
              ? <img src={companero.avatarUrl} alt={companero.nombre} className="w-full h-full object-cover" />
              : companero.avatarEmoji
                ? <span className="text-4xl leading-none">{companero.avatarEmoji}</span>
                : companero.nombre?.charAt(0).toUpperCase()
            }
          </div>
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <p className="text-[15px] font-bold text-foreground leading-snug">{companero.nombre}</p>
            {isOwnProfile && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "oklch(0.52 0.13 165 / 0.14)", color: "oklch(0.42 0.13 165)" }}>Tú</span>
            )}
          </div>
          {companero.rol && <p className="text-[12px] text-muted-foreground mt-0.5">{companero.rol}</p>}
          {companero.area && (
            <span className="inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full mt-2"
              style={{ backgroundColor: `oklch(0.62 0.18 ${profileHue} / 0.12)`, color: `oklch(0.42 0.18 ${profileHue})` }}>
              {companero.area}
            </span>
          )}
        </div>

        <div className="mx-4 h-px bg-border/60 flex-shrink-0" />

        {/* Info sections */}
        <div className="flex-1 px-4 overflow-y-auto divide-y divide-border/40">

          {(isAdmin || isOwnProfile) && (companero.correo || companero.email || companero.whatsapp) && (
            <div className="py-4">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Contacto</p>
              {(companero.correo || companero.email) && (
                <p className="text-[12px] text-foreground truncate">{companero.correo || companero.email}</p>
              )}
              {companero.whatsapp && (
                <p className="text-[12px] text-muted-foreground mt-1">{companero.whatsapp}</p>
              )}
            </div>
          )}

          {companero.trabajaEn && (
            <div className="py-4">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Trabajando en</p>
              <p className="text-[12px] text-foreground leading-relaxed">{companero.trabajaEn}</p>
            </div>
          )}

          {companero.herramientas?.length > 0 && (
            <div className="py-4">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {companero.herramientas.map(tool => (
                  <span key={tool} className="text-[10px] px-2.5 py-1 rounded-md font-medium"
                    style={{ backgroundColor: "oklch(0.62 0.12 230 / 0.12)", color: "oklch(0.45 0.14 230)" }}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Perfil profesional — solo lectura, edición en "Editar perfil" */}
          <div className="py-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Perfil profesional</p>
            <div className="space-y-2">
              {[
                { key: "hojaDeVida", label: "Hoja de vida", hue: "145" },
                { key: "portafolio", label: "Portafolio",   hue: "230" },
                { key: "pda",        label: "PDA",           hue: "55"  },
              ].map(({ key, label, hue }) => {
                const data = companero.perfilProfesional?.[key]
                return (
                  <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ background: "var(--muted)" }}>
                    <span className="text-[12px] font-medium text-foreground">{label}</span>
                    {data?.url
                      ? <a href={data.url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                          style={{ background: `oklch(0.62 0.18 ${hue} / 0.14)`, color: `oklch(0.48 0.18 ${hue})` }}>
                          Abrir ↗
                        </a>
                      : <span className="text-[11px] text-muted-foreground/40">—</span>
                    }
                  </div>
                )
              })}
            </div>
          </div>

          {companero.notas && (
            <div className="py-4">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Notas</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed break-words">{companero.notas}</p>
            </div>
          )}
        </div>

        <div className="mx-4 h-px bg-border/60 flex-shrink-0" />

        {/* Editar / Eliminar */}
        {canEdit && (
          <div className="px-4 py-4 space-y-0.5 flex-shrink-0">
            <button onClick={() => { navigate(`/semillero/${semilleroId}/colleague/${id}/edit`); setSidebarOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors hover:bg-muted text-left"
              style={{ color: "var(--foreground)" }}>
              Editar perfil
            </button>
            {isAdmin && (
              <button onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors hover:bg-muted/40 text-left"
                style={{ color: "var(--destructive)" }}>
                Eliminar
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <style>{`@media (min-width: 1024px) { .cd-offset { margin-left: 272px; } }`}</style>
      <div className="cd-offset flex-1 flex flex-col min-h-screen">

        {/* Topbar */}
        <header className="sticky top-0 z-20 h-14 border-b border-border/60 px-5 flex items-center gap-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>
          <button className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors flex-shrink-0"
            onClick={() => setSidebarOpen(v => !v)}>
            <span className="text-muted-foreground font-bold text-[16px]">☰</span>
          </button>
          <div className="hidden lg:flex items-center gap-2 text-[12px]">
            <button onClick={() => navigate(`/semillero/${semilleroId}/dashboard`)}
              className="text-muted-foreground hover:text-foreground transition-colors">← Equipo</button>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{companero.nombre}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Tab bar */}
        <div className="border-b border-border/50 px-5 flex sticky top-14 z-10"
          style={{ backgroundColor: "color-mix(in srgb, var(--background) 95%, transparent)", backdropFilter: "blur(12px)" }}>
          {[
            { key: "proyectos", label: "Actividades", count: companero.proyectos?.length || 0 },
            { key: "bitacora",  label: "Bitácora",  count: logs.length },
            ...(isAdmin || isOwnProfile ? [
              { key: "tareas",   label: "Tareas",   count: tasks.filter(t => t.estado !== "Hecha").length },
              { key: "feedback", label: "Feedback",  count: feedback.length },
            ] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px whitespace-nowrap"
              style={activeTab === t.key
                ? { color: "var(--foreground)", borderBottomColor: "oklch(0.52 0.13 165)" }
                : { color: "var(--muted-foreground)", borderBottomColor: "transparent" }}>
              {t.label}
              {t.count > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={activeTab === t.key
                    ? { background: "oklch(0.52 0.13 165 / 0.14)", color: "oklch(0.42 0.13 165)" }
                    : { background: "var(--muted)", color: "var(--muted-foreground)" }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <main className="flex-1 px-6 py-6 space-y-6">

        {activeTab === "proyectos" && (<>
        {/* ── Proyectos ── */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[18px] font-bold text-foreground tracking-tight">
              Actividades
              {companero.proyectos?.length > 0 && (
                <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                  ({companero.proyectos.length})
                </span>
              )}
            </h2>
            {canEdit && (
              <Button size="sm" className="text-[13px] h-8" onClick={() => { setShowProjectForm(v => !v); setEditingProject(null); setProjectForm(emptyProjectForm); setPdfImported(false) }}>
                {showProjectForm && !editingProject ? "Cancelar" : "+ Actividad"}
              </Button>
            )}
          </div>

          {/* ── Inline project form ─────────────────────────────────────── */}
          {showProjectForm && canEdit && (
            <div className="rounded-xl border border-border p-4 space-y-3 mb-3" style={{ background: "var(--muted)" }}>
              <p className="text-[13px] font-semibold text-foreground">{editingProject ? "Editar actividad" : "Nueva actividad"}</p>
              <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfImport} />
              {!editingProject && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
                      style={{ background: "oklch(0.55 0.18 260 / 0.12)", color: "oklch(0.55 0.18 260)" }}>⬆</div>
                    <p className="text-[13px] font-semibold text-foreground">Importar desde PDF de propuesta</p>
                  </div>
                  <div className="rounded-lg p-3 space-y-1.5" style={{ background: "oklch(0.55 0.18 260 / 0.06)", border: "1px solid oklch(0.55 0.18 260 / 0.15)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "oklch(0.50 0.18 260)" }}>Cómo hacerlo</p>
                    {[
                      { n: "1", text: "Ingresa al Asistente de Propuestas", link: "https://plataforma-investigaciones-vgpt.web.app/dashboard" },
                      { n: "2", text: "Genera el PDF de tu propuesta allí" },
                      { n: "3", text: "Descárgalo y súbelo aquí con el botón de abajo" },
                    ].map(step => (
                      <div key={step.n} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5"
                          style={{ background: "oklch(0.55 0.18 260)" }}>{step.n}</span>
                        {step.link
                          ? <a href={step.link} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "oklch(0.50 0.18 260)" }}>
                              {step.text}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          : <span className="text-[11px] text-muted-foreground">{step.text}</span>}
                      </div>
                    ))}
                  </div>
                  {pdfError && <p className="text-[11px] text-destructive">{pdfError}</p>}
                  {pdfImported && <p className="text-[11px] font-medium" style={{ color: "oklch(0.55 0.18 145)" }}>✓ Datos importados correctamente.</p>}
                  <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}
                    className="w-full text-[12px] font-semibold px-3 py-2 rounded-lg border transition-all disabled:opacity-50"
                    style={{ borderColor: "oklch(0.55 0.18 260 / 0.35)", color: "oklch(0.50 0.18 260)", background: "oklch(0.55 0.18 260 / 0.07)" }}>
                    {pdfLoading ? "Leyendo…" : "⬆ Seleccionar PDF"}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Nombre *</p>
                  <input placeholder="Nombre de la actividad" value={projectForm.nombre}
                    onChange={e => setProjectForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Estado</p>
                  <select value={projectForm.estado} onChange={e => setProjectForm(f => ({ ...f, estado: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30">
                    {PROJ_ESTADOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Área</p>
                  <input placeholder="Área o enfoque" value={projectForm.area}
                    onChange={e => setProjectForm(f => ({ ...f, area: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Herramientas (separadas por coma)</p>
                  <input placeholder="React, Firebase, Python…" value={projectForm.herramientas}
                    onChange={e => setProjectForm(f => ({ ...f, herramientas: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fecha inicio</p>
                  <input type="date" value={projectForm.fechaInicio}
                    onChange={e => setProjectForm(f => ({ ...f, fechaInicio: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fecha entrega</p>
                  <input type="date" value={projectForm.fechaEntrega}
                    onChange={e => setProjectForm(f => ({ ...f, fechaEntrega: e.target.value }))}
                    className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Qué hace</p>
                  <textarea placeholder="Descripción de la actividad…" value={projectForm.queHace}
                    onChange={e => setProjectForm(f => ({ ...f, queHace: e.target.value }))}
                    rows={2} className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observaciones</p>
                  <textarea placeholder="Notas adicionales…" value={projectForm.observaciones}
                    onChange={e => setProjectForm(f => ({ ...f, observaciones: e.target.value }))}
                    rows={2} className="w-full bg-card border border-border rounded-xl px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
                </div>
              </div>
              {/* Archivos adjuntos del proyecto */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Archivos adjuntos</p>
                <input ref={projAttachRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv,.pptx,.ppt" className="hidden"
                  onChange={e => { Array.from(e.target.files || []).forEach(f => handleAttachFile(f, `proyectos/${id}/${projectForm.nombre.replace(/[^a-zA-Z0-9]/g,"_") || "nuevo"}`, meta => setProjectForm(prev => ({ ...prev, archivos: [...(prev.archivos||[]), meta] })), setProjAttachUploading)); e.target.value="" }} />
                {(projectForm.archivos || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] rounded-lg px-2 py-1.5 border border-border bg-muted/40">
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 flex-1 min-w-0 hover:opacity-70 transition-opacity"
                        style={{ color: "oklch(0.42 0.14 165)" }}>
                        📎 <span className="truncate">{f.nombre}</span>
                        <span className="text-muted-foreground flex-shrink-0 text-[10px]">Ver →</span>
                      </a>
                    ) : (
                      <span className="flex-1 truncate text-foreground">📎 {f.nombre}</span>
                    )}
                    {f.size && <span className="text-muted-foreground flex-shrink-0">{(f.size/1024).toFixed(0)} KB</span>}
                    <button type="button" onClick={() => setProjectForm(prev => ({ ...prev, archivos: prev.archivos.filter((_,j) => j !== i) }))} className="text-destructive hover:opacity-70 flex-shrink-0">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => projAttachRef.current?.click()} disabled={projAttachUploading}
                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-ring/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50">
                  📎 {projAttachUploading ? "Subiendo…" : "Adjuntar archivo"}
                </button>
              </div>

              {projectSaveError && <p className="text-[12px] text-destructive">{projectSaveError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveProject} disabled={savingProject || !projectForm.nombre.trim() || projAttachUploading}
                  className="h-9 px-5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.44 0.14 185))" }}>
                  {savingProject ? "Guardando…" : editingProject ? "Actualizar actividad" : "Crear actividad"}
                </button>
                <button onClick={() => { setShowProjectForm(false); setEditingProject(null); setProjectForm(emptyProjectForm) }}
                  className="h-9 px-4 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {companero.proyectos?.length > 0 && (
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar actividad…"
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                className="w-full h-9 bg-card border border-border rounded-xl pl-8 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/30 transition-all"
              />
            </div>
          )}

          {(() => {
            const q = projectSearch.toLowerCase()
            const filtered = [...(companero.proyectos || [])].reverse().filter(p =>
              !q ||
              p.nombre?.toLowerCase().includes(q) ||
              p.queHace?.toLowerCase().includes(q) ||
              p.herramientas?.some(t => t.toLowerCase().includes(q)) ||
              p.area?.toLowerCase().includes(q)
            )
            return filtered.length > 0 ? (
            <div className="overflow-y-auto space-y-3 pr-0.5" style={{ maxHeight: "520px" }}>
              {filtered.map((proyecto, index) => {
                const CHART_HUES = [165, 295, 40, 230, 10]
                const pH = CHART_HUES[index % CHART_HUES.length]
                const pState = proyecto.estado ? PROJECT_STATE_STYLE[proyecto.estado] : null
                return (
                  <div key={index}
                    className="bg-card border border-border rounded-2xl overflow-hidden group"
                    style={{ borderLeftColor: `oklch(0.58 0.16 ${pH})`, borderLeftWidth: "3px" }}>
                    <div className="p-5">

                      {/* Project header */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-foreground text-[15px] leading-tight">{proyecto.nombre}</h3>
                            {pState && (
                              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ color: pState.color, backgroundColor: pState.bg }}>
                                {proyecto.estado}
                              </span>
                            )}
                          </div>
                          {proyecto.area && (
                            <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5"
                              style={{ backgroundColor: "oklch(0.52 0.13 165 / 0.12)", color: "oklch(0.52 0.13 165)" }}>
                              {proyecto.area}
                            </span>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingProject(proyecto)
                                setProjectForm({
                                  nombre: proyecto.nombre || "",
                                  estado: proyecto.estado || "En ejecución",
                                  area: proyecto.area || "",
                                  herramientas: Array.isArray(proyecto.herramientas) ? proyecto.herramientas.join(", ") : (proyecto.herramientas || ""),
                                  queHace: proyecto.queHace || "",
                                  observaciones: proyecto.observaciones || "",
                                  fechaInicio: proyecto.fechaInicio || "",
                                  fechaEntrega: proyecto.fechaEntrega || "",
                                  archivos: proyecto.archivos || [],
                                })
                                setShowProjectForm(true)
                                setPdfImported(false)
                                setPdfError(null)
                                window.scrollTo({ top: 0, behavior: "smooth" })
                              }}
                              className="text-[12px] font-semibold hover:opacity-70 transition-opacity"
                              style={{ color: "oklch(0.42 0.14 165)" }}>
                              Editar
                            </button>
                            {grupos.length > 0 && (
                              <button
                                onClick={() => { setEnrutandoProyecto(proyecto); setGrupoSeleccionado("") }}
                                className="text-[12px] font-semibold hover:opacity-70 transition-opacity"
                                style={{ color: "oklch(0.38 0.18 145)" }}>
                                → Grupo
                              </button>
                            )}
                            <button onClick={() => handleDeleteProject(proyecto)}
                              className="text-[12px] font-semibold text-destructive hover:opacity-70 transition-opacity">
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Enrutar proyecto a grupo — panel separado debajo del encabezado */}
                      {enrutandoProyecto?.nombre === proyecto.nombre && enrutandoProyecto?.fechaInicio === proyecto.fechaInicio && (
                        <div className="mb-4 p-4 rounded-xl space-y-3"
                          style={{ background: `oklch(0.60 0.16 145 / 0.08)`, border: `1px solid oklch(0.55 0.16 145 / 0.35)` }}>
                          <p className="text-[13px] font-bold" style={{ color: "oklch(0.40 0.16 145)" }}>
                            Mover actividad al grupo
                          </p>
                          <select
                            value={grupoSeleccionado}
                            onChange={e => setGrupoSeleccionado(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40">
                            <option value="">Selecciona un grupo…</option>
                            {grupos.map(g => (
                              <option key={g.id} value={g.id}>{g.nombre}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={handleEnrutarProyecto}
                              disabled={!grupoSeleccionado || savingEnrute}
                              className="h-8 px-4 rounded-lg text-[12px] font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                              style={{ background: "oklch(0.52 0.18 145)" }}>
                              {savingEnrute ? "Moviendo…" : "Confirmar"}
                            </button>
                            <button
                              onClick={() => { setEnrutandoProyecto(null); setGrupoSeleccionado("") }}
                              className="h-8 px-4 rounded-lg text-[12px] font-semibold border border-border text-foreground hover:bg-muted transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Avance — derivado del estado del proyecto */}
                      {(isOwnProfile || isAdmin) && (() => {
                        const av = getAvance(proyecto)
                        const color = av >= 75 ? "oklch(0.60 0.18 145)" : av >= 50 ? "oklch(0.60 0.18 260)" : av >= 25 ? "oklch(0.68 0.18 55)" : "oklch(0.65 0.22 27)"
                        const gradient = av >= 75
                          ? "linear-gradient(90deg, oklch(0.55 0.18 145), oklch(0.62 0.20 155))"
                          : av >= 50
                            ? "linear-gradient(90deg, oklch(0.55 0.18 260), oklch(0.62 0.20 280))"
                            : av >= 25
                              ? "linear-gradient(90deg, oklch(0.60 0.18 55), oklch(0.68 0.20 65))"
                              : "linear-gradient(90deg, oklch(0.60 0.22 27), oklch(0.65 0.22 35))"
                        return (
                          <div className="mb-2.5">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Avance</span>
                              <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{av}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "oklch(0.40 0.02 260 / 0.3)" }}>
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${av}%`, background: gradient }} />
                            </div>
                          </div>
                        )
                      })()}

                      {/* Content */}
                      {proyecto.queHace && (
                        <p className="text-[13px] text-muted-foreground mb-2.5 leading-relaxed">
                          <span className="font-semibold text-foreground">Qué hace: </span>{proyecto.queHace}
                        </p>
                      )}

                      {proyecto.herramientas?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {proyecto.herramientas.map(tool => (
                            <span key={tool} className="text-[11px] px-2.5 py-0.5 rounded-lg font-semibold"
                              style={{ backgroundColor: `oklch(0.58 0.10 ${pH} / 0.16)`, color: `oklch(0.58 0.13 ${pH})` }}>
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}

                      {proyecto.observaciones && (
                        <p className="text-[13px] text-muted-foreground leading-relaxed mb-2.5">
                          <span className="font-semibold text-foreground">Observaciones: </span>{proyecto.observaciones}
                        </p>
                      )}

                      {/* Archivos adjuntos del proyecto */}
                      {proyecto.archivos?.length > 0 && (
                        <div className="flex flex-col gap-1.5 mb-2.5">
                          {proyecto.archivos.map((f, fi) => {
                            const isPdf = f.nombre?.toLowerCase().endsWith(".pdf") || f.tipo?.includes("pdf")
                            const isOpen = previewFile?.url === f.url
                            return (
                              <div key={fi} className="flex flex-col rounded-lg border border-border bg-muted/50 overflow-hidden">
                                <div className="flex items-center gap-0.5">
                                  <button type="button"
                                    onClick={() => isPdf ? setPreviewFile(isOpen ? null : f) : window.open(f.url, "_blank")}
                                    className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 hover:bg-muted transition-colors flex-1 min-w-0 text-left"
                                    style={{ color: `oklch(0.50 0.14 ${pH})` }}>
                                    {isPdf ? "📄" : "📎"} <span className="truncate flex-1">{f.nombre}</span>
                                    <span className="text-muted-foreground text-[10px] flex-shrink-0">{isPdf ? (isOpen ? "Cerrar ↑" : "Ver PDF ↓") : "Abrir →"}</span>
                                  </button>
                                  {(isOwnProfile || isAdmin) && (
                                    <button type="button"
                                      onClick={() => handleDeleteProjectFile(proyecto, f)}
                                      className="px-1.5 py-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0 text-[11px]">
                                      ✕
                                    </button>
                                  )}
                                </div>
                                {isPdf && isOpen && (
                                  <iframe src={f.url} title={f.nombre}
                                    className="w-full border-t border-border"
                                    style={{ height: "500px" }} />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Timeline */}
                      {(proyecto.fechaInicio || proyecto.fechaEntrega || proyecto.versiones?.length > 0) && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                            {proyecto.fechaInicio && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">Inicio:</span>
                                <span className="text-[11px] font-semibold text-foreground">
                                  {format(parseLocalDate(proyecto.fechaInicio), "d MMM yyyy", { locale: es })}
                                </span>
                              </div>
                            )}
                            {proyecto.fechaEntrega && (() => {
                              const done = proyecto.estado === "Completado"
                              const st = done ? null : deadlineStatus(proyecto.fechaEntrega)
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] text-muted-foreground">Entrega:</span>
                                  <span className="text-[11px] font-semibold text-foreground">
                                    {format(parseLocalDate(proyecto.fechaEntrega), "d MMM yyyy", { locale: es })}
                                  </span>
                                  {st && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                      style={{ color: st.color, backgroundColor: st.bg }}>
                                      {st.label}
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
                          </div>

                          {proyecto.versiones?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              
                              {proyecto.versiones.map((v, vi) => {
                                const vStyle = v.estado ? VERSION_STATE_STYLE[v.estado] : null
                                return (
                                  <span key={vi}
                                    className="text-[11px] px-2.5 py-1 rounded-lg border border-border text-muted-foreground flex items-center gap-1.5"
                                    style={vStyle ? { borderColor: vStyle.color + "44", backgroundColor: vStyle.bg } : {}}>
                                    <span className="font-semibold" style={{ color: vStyle ? vStyle.color : `oklch(0.60 0.14 ${pH})` }}>
                                      {v.nombre}
                                    </span>
                                    {v.fecha && (
                                      <span className="opacity-70">— {format(parseLocalDate(v.fecha), "d MMM", { locale: es })}</span>
                                    )}
                                    {v.estado && (
                                      <span className="font-bold" style={{ color: vStyle?.color }}>· {v.estado}</span>
                                    )}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 gap-3 bg-card border border-border rounded-2xl">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "oklch(0.52 0.13 165 / 0.10)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.13 165)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                </svg>
              </div>
              <p className="text-[13px] font-medium text-muted-foreground">{projectSearch ? "Sin resultados para esa búsqueda." : "Sin actividades registradas."}</p>
            </div>
          )
        })()}
        </div>
        </>)}

        {activeTab === "bitacora" && (<>
        {/* ── Bitácora ── */}
        <div>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-[18px] font-bold text-foreground tracking-tight">Bitácora</h2>
            {(isSuperAdmin || isAdmin) && logs.length > 0 && (
              <div className="flex items-center gap-2">
                {logSelectMode && selectedLogIds.size > 0 && (
                  <button onClick={async () => {
                    if (!confirm(`¿Eliminar ${selectedLogIds.size} nota${selectedLogIds.size !== 1 ? "s" : ""}?`)) return
                    await Promise.all([...selectedLogIds].map(lid => deleteLog(lid)))
                    setLogs(prev => prev.filter(l => !selectedLogIds.has(l.id)))
                    setSelectedLogIds(new Set())
                    setLogSelectMode(false)
                  }} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-destructive text-white hover:opacity-90 transition-opacity">
                    Eliminar {selectedLogIds.size}
                  </button>
                )}
                <button onClick={() => { setLogSelectMode(v => !v); setSelectedLogIds(new Set()) }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${logSelectMode ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {logSelectMode ? "Cancelar" : "Seleccionar"}
                </button>
                {!logSelectMode && logs.some(l => l.nota?.startsWith("Nuevo proyecto:")) && (
                  <button onClick={async () => {
                    if (!confirm("¿Eliminar todas las entradas automáticas de 'Nuevo proyecto:'?")) return
                    const auto = logs.filter(l => l.nota?.startsWith("Nuevo proyecto:"))
                    await Promise.all(auto.map(l => deleteLog(l.id)))
                    setLogs(prev => prev.filter(l => !l.nota?.startsWith("Nuevo proyecto:")))
                  }} className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                    Limpiar automáticas
                  </button>
                )}
              </div>
            )}
          </div>

          {isOwnProfile && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3"
              style={{ borderTopColor: "oklch(0.52 0.13 165)", borderTopWidth: "3px" }}>
              <form onSubmit={handleAddLog} className="p-5">
                <div className="flex justify-end mb-2.5">
                  <button type="button" onClick={() => setShowEmoji(v => !v)}
                    className="text-lg leading-none hover:scale-110 transition-transform" title="Insertar emoji">
                    😊
                  </button>
                </div>
                {showEmoji && (
                  <div className="mb-3 rounded-xl overflow-hidden">
                    <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" height={330}
                      searchPlaceholder="Buscar emoji…" skinTonesDisabled
                      previewConfig={{ showPreview: false }} />
                  </div>
                )}
                <textarea ref={notaRef} value={nota} onChange={e => setNota(e.target.value)}
                  placeholder="¿En qué estás trabajando esta semana?"
                  rows={3}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none transition-all" />
                <input ref={logAttachRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" className="hidden"
                  onChange={e => { Array.from(e.target.files||[]).forEach(f => handleAttachFile(f, `logs/${id}`, meta => setLogAttachFiles(p => [...p, meta]), setLogAttachUploading)); e.target.value="" }} />
                {logAttachFiles.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    {logAttachFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] px-2 py-1 rounded-lg border border-border bg-muted/40">
                        <span className="flex-1 truncate">{f.nombre}</span>
                        <button type="button" onClick={() => setLogAttachFiles(p => p.filter((_,j)=>j!==i))} className="text-destructive hover:opacity-70">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => logAttachRef.current?.click()} disabled={logAttachUploading}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                    📎 {logAttachUploading ? "Subiendo…" : "Adjuntar archivo"}
                  </button>
                  <button type="submit" disabled={saving || logAttachUploading}
                    className="text-[13px] font-semibold px-5 py-2 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.44 0.14 185))" }}>
                    {saving ? "Guardando…" : "Guardar nota"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {logs.length > 0 && (
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="Buscar en bitácora…" value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                className="w-full h-9 bg-card border border-border rounded-xl pl-8 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/30 transition-all" />
            </div>
          )}

          {(() => {
            const q = logSearch.toLowerCase()
            const filteredLogs = logs.filter(l => !q || l.nota?.toLowerCase().includes(q))
            return filteredLogs.length > 0 ? (
              <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: "420px" }}>
                {filteredLogs.map(log => (
                  <div key={log.id}
                    className={`bg-card border rounded-xl p-4 group transition-colors ${logSelectMode && selectedLogIds.has(log.id) ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                    onClick={logSelectMode ? () => setSelectedLogIds(prev => { const s = new Set(prev); s.has(log.id) ? s.delete(log.id) : s.add(log.id); return s }) : undefined}
                    style={logSelectMode ? { cursor: "pointer" } : {}}>
                    {logSelectMode && (
                      <div className="flex items-center gap-2 mb-2">
                        <input type="checkbox" readOnly checked={selectedLogIds.has(log.id)}
                          className="w-4 h-4 accent-destructive pointer-events-none" />
                        <span className="text-[11px] text-muted-foreground">Seleccionar para eliminar</span>
                      </div>
                    )}
                    {editingLogId === log.id ? (
                      <div className="space-y-2">
                        <textarea value={editingLogText} onChange={e => setEditingLogText(e.target.value)}
                          rows={3}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEditLog(log.id)}
                            className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg text-white"
                            style={{ backgroundColor: "oklch(0.52 0.13 165)" }}>
                            Guardar
                          </button>
                          <button onClick={() => setEditingLogId(null)}
                            className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0"
                          style={{ backgroundColor: "oklch(0.52 0.13 165)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-foreground leading-relaxed">{log.nota}</p>
                          {log.archivos?.length > 0 && (
                            <div className="flex flex-col gap-1 mt-2">
                              {log.archivos.map((f, i) => (
                                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-[12px] px-2 py-1 rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors max-w-xs">
                                  <span className="text-muted-foreground">📎</span>
                                  <span className="truncate text-foreground">{f.nombre}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-1.5">
                            <p className="text-[11px] text-muted-foreground capitalize">
                              {log.createdAt?.toDate
                                ? format(log.createdAt.toDate(), "EEEE d 'de' MMMM, yyyy", { locale: es })
                                : ""}
                            </p>
                            {(isSuperAdmin || isAdmin || isOwnProfile || log.creadoPor === user?.uid) && (
                              <div className="flex gap-3">
                                {(isOwnProfile || log.creadoPor === user?.uid) && (
                                  <button onClick={() => handleStartEditLog(log)}
                                    className="text-[12px] font-semibold hover:opacity-70 transition-opacity"
                                    style={{ color: "oklch(0.42 0.14 165)" }}>
                                    Editar
                                  </button>
                                )}
                                <button onClick={() => handleDeleteLog(log.id)}
                                  className="text-[12px] text-destructive hover:opacity-70 transition-opacity">
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 gap-3 bg-card border border-border rounded-2xl">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "oklch(0.52 0.13 165 / 0.10)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.52 0.13 165)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-muted-foreground">{logSearch ? "Sin resultados para esa búsqueda." : "Sin notas aún. Agrega la primera."}</p>
              </div>
            )
          })()}
        </div>
        </>)}

        {activeTab === "feedback" && (<>
        {/* ── Retroalimentación — solo admin y dueño del perfil ── */}
        {(isOwnProfile || isAdmin) && (
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">Retroalimentación</h2>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: "oklch(0.70 0.18 55 / 0.12)", color: "oklch(0.58 0.16 50)" }}>
                🔒 Privado
              </span>
            </div>

            {/* Formulario — solo admins */}
            {isAdmin && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3"
                style={{ borderTopColor: "oklch(0.68 0.18 55)", borderTopWidth: "3px" }}>
                <form onSubmit={handleAddFeedback} className="p-5">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Escribe retroalimentación para {companero.nombre}
                  </p>
                  {editingFbId ? (
                    <div className="space-y-2">
                      <textarea value={editingFbText} onChange={e => setEditingFbText(e.target.value)}
                        rows={3}
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none transition-all" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleSaveEditFeedback(editingFbId)}
                          className="text-[13px] font-semibold px-5 py-2 rounded-xl text-white transition-all hover:opacity-90"
                          style={{ background: "linear-gradient(135deg, oklch(0.62 0.18 55), oklch(0.55 0.20 40))" }}>
                          Guardar cambios
                        </button>
                        <button type="button" onClick={() => setEditingFbId(null)}
                          className="text-[13px] font-medium px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                        placeholder="Ej: Buen avance esta semana, recuerda documentar los cambios…"
                        rows={3}
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground mb-3 focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none transition-all" />
                      <button type="submit" disabled={savingFeedback}
                        className="text-[13px] font-semibold px-5 py-2 rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, oklch(0.62 0.18 55), oklch(0.55 0.20 40))" }}>
                        {savingFeedback ? "Enviando…" : "Enviar retroalimentación"}
                      </button>
                    </>
                  )}
                </form>
              </div>
            )}

            {/* Lista de retroalimentaciones */}
            {feedback.length > 0 ? (
              <div className="overflow-y-auto space-y-3 pr-0.5" style={{ maxHeight: "460px" }}>
                {feedback.map(fb => {
                  const authorName = fb.creadoPorNombre || fb.creadoPorEmail || "Admin"
                  const authorInitial = authorName.charAt(0).toUpperCase()
                  return (
                    <div key={fb.id} className="rounded-xl overflow-hidden border group"
                      style={{
                        borderColor: "oklch(0.68 0.18 55 / 0.35)",
                        backgroundColor: "oklch(0.65 0.14 55 / 0.07)",
                      }}>

                      {/* Cabecera con autor — visualmente distinta de la bitácora */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b"
                        style={{ borderColor: "oklch(0.68 0.18 55 / 0.20)", backgroundColor: "oklch(0.65 0.16 55 / 0.10)" }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, oklch(0.65 0.20 50), oklch(0.55 0.22 38))" }}>
                            {authorInitial}
                          </div>
                          <span className="text-[13px] font-semibold" style={{ color: "oklch(0.68 0.18 50)" }}>
                            {authorName}
                          </span>
                          {fb.createdAt?.toDate && (
                            <span className="text-[11px] text-muted-foreground">
                              · {format(fb.createdAt.toDate(), "d 'de' MMMM, yyyy", { locale: es })}
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingFbId(fb.id); setEditingFbText(fb.texto) }}
                              className="text-[12px] font-semibold hover:opacity-70 transition-opacity"
                              style={{ color: "oklch(0.40 0.16 55)" }}>
                              Editar
                            </button>
                            <button onClick={() => handleDeleteFeedback(fb.id)}
                              className="text-[12px] text-destructive hover:opacity-70 transition-opacity">
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Contenido */}
                      <div className="px-4 py-3">
                        <p className="text-[14px] text-foreground leading-relaxed">{fb.texto}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 gap-3 bg-card border border-border rounded-2xl">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "oklch(0.75 0.15 80 / 0.12)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.65 0.16 75)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-muted-foreground">
                  {isAdmin ? "Aún no hay retroalimentación para esta persona." : "Aún no tienes retroalimentación."}
                </p>
              </div>
            )}
          </div>
        )}
        </>)}

        {activeTab === "tareas" && (<>
        {/* ── Tareas — solo admin y dueño del perfil ── */}
        {(isOwnProfile || isAdmin) && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[18px] font-bold text-foreground tracking-tight">Tareas</h2>
                {tasks.length > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "oklch(0.60 0.18 260 / 0.12)", color: "oklch(0.55 0.18 260)" }}>
                    {tasks.filter(t => t.estado !== "Hecha").length} pendientes
                  </span>
                )}
              </div>
              {isAdmin && (
                <button onClick={() => setShowTaskForm(v => !v)}
                  className="text-[12px] font-semibold h-8 px-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                  {showTaskForm ? "Cancelar" : "+ Tarea"}
                </button>
              )}
            </div>

            {/* Formulario nueva tarea — solo admins */}
            {isAdmin && showTaskForm && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-3"
                style={{ borderTopColor: "oklch(0.60 0.18 260)", borderTopWidth: "3px" }}>
                <form onSubmit={handleAddTask} className="p-5 space-y-3">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Nueva tarea para {companero.nombre}
                  </p>
                  <input
                    value={taskForm.titulo} onChange={e => setTaskForm(f => ({ ...f, titulo: e.target.value }))}
                    placeholder="Título de la tarea *"
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all" />
                  <textarea
                    value={taskForm.descripcion} onChange={e => setTaskForm(f => ({ ...f, descripcion: e.target.value }))}
                    placeholder="Descripción o instrucciones (opcional)"
                    rows={2}
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none transition-all" />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-[12px] font-medium text-muted-foreground mb-1">Fecha inicio</label>
                      <input type="date" value={taskForm.fechaInicio} onChange={e => setTaskForm(f => ({ ...f, fechaInicio: e.target.value }))}
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[12px] font-medium text-muted-foreground mb-1">Fecha límite</label>
                      <input type="date" value={taskForm.fechaLimite} onChange={e => setTaskForm(f => ({ ...f, fechaLimite: e.target.value }))}
                        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-muted-foreground mb-1">Avance inicial: {taskForm.avance}%</label>
                    <input type="range" min="0" max="100" step="5" value={taskForm.avance}
                      onChange={e => setTaskForm(f => ({ ...f, avance: e.target.value }))}
                      className="w-full accent-primary" />
                  </div>
                  {/* Archivos adjuntos para la tarea */}
                  <div className="space-y-1.5">
                    <input ref={taskAttachRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" className="hidden"
                      onChange={e => { Array.from(e.target.files||[]).forEach(f => handleAttachFile(f, `tareas-nuevas/${id}`, meta => setTaskAttachFiles(p => [...p, meta]), setTaskAttachUploading)); e.target.value="" }} />
                    {taskAttachFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] px-2 py-1 rounded-lg border border-border bg-muted/40">
                        <span className="flex-1 truncate">{f.nombre}</span>
                        <button type="button" onClick={() => setTaskAttachFiles(p => p.filter((_,j)=>j!==i))} className="text-destructive">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => taskAttachRef.current?.click()} disabled={taskAttachUploading}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                      📎 {taskAttachUploading ? "Subiendo…" : "Adjuntar archivo"}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingTask || taskAttachUploading}
                      className="h-10 px-5 rounded-xl text-[13px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 260), oklch(0.50 0.22 280))" }}>
                      {savingTask ? "Guardando…" : "Guardar tarea"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Lista de tareas */}
            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map(task => {
                  const vencida = task.fechaLimite && task.estado !== "Hecha" && new Date(task.fechaLimite) < new Date()
                  const estadoColors = {
                    "Pendiente": { color: "oklch(0.65 0.22 27)", bg: "oklch(0.65 0.22 27 / 0.10)" },
                    "En proceso": { color: "oklch(0.62 0.18 260)", bg: "oklch(0.62 0.18 260 / 0.10)" },
                    "Hecha":      { color: "oklch(0.60 0.18 145)", bg: "oklch(0.60 0.18 145 / 0.10)" },
                  }
                  const st = estadoColors[task.estado] || estadoColors["Pendiente"]
                  return (
                    <div key={task.id} className="bg-card border border-border rounded-xl p-4 group">
                      {editingTaskId === task.id ? (
                        /* ── Formulario edición inline ── */
                        <div className="space-y-3">
                          {/* Campos de edición — solo admin */}
                          {isAdmin && (
                            <>
                              <input value={editingTaskForm.titulo}
                                onChange={e => setEditingTaskForm(f => ({ ...f, titulo: e.target.value }))}
                                placeholder="Título *"
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                              <textarea value={editingTaskForm.descripcion}
                                onChange={e => setEditingTaskForm(f => ({ ...f, descripcion: e.target.value }))}
                                placeholder="Descripción (opcional)" rows={2}
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none" />
                              <div className="flex gap-3">
                                <div className="flex-1">
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Fecha inicio</label>
                                  <input type="date" value={editingTaskForm.fechaInicio || ""}
                                    onChange={e => setEditingTaskForm(f => ({ ...f, fechaInicio: e.target.value }))}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Fecha límite</label>
                                  <input type="date" value={editingTaskForm.fechaLimite || ""}
                                    onChange={e => setEditingTaskForm(f => ({ ...f, fechaLimite: e.target.value }))}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                                  Avance: <span className="font-bold text-foreground">{editingTaskForm.avance ?? 0}%</span>
                                </label>
                                <input type="range" min="0" max="100" step="5" value={editingTaskForm.avance ?? 0}
                                  onChange={e => setEditingTaskForm(f => ({ ...f, avance: Number(e.target.value) }))}
                                  className="w-full accent-primary" />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveEditTask(task)}
                                  className="h-8 px-4 rounded-xl text-[12px] font-bold text-white transition-all hover:opacity-90"
                                  style={{ background: "linear-gradient(135deg, oklch(0.58 0.20 260), oklch(0.50 0.22 280))" }}>
                                  Guardar
                                </button>
                                <button onClick={() => { setEditingTaskId(null); setSolicitudMotivo(""); setSolicitudFecha("") }}
                                  className="h-8 px-4 rounded-xl text-[12px] font-medium border border-border text-muted-foreground hover:text-foreground transition-colors">
                                  Cancelar
                                </button>
                              </div>
                            </>
                          )}

                          {/* Solicitud de plazo pendiente — visible para admin dentro del panel de edición */}
                          {isAdmin && task.solicitudPlazo && (
                            <div className="pt-3 border-t border-border space-y-2">
                              <p className="text-[12px] font-semibold text-foreground">⏰ Solicitud de tiempo extra</p>
                              <div className="px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.68 0.18 55 / 0.10)", border: "1px solid oklch(0.68 0.18 55 / 0.30)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.58 0.20 55)" }}>
                                  Solicitado por: {task.solicitudPlazo.solicitadoPor}
                                </p>
                                <p className="text-[12px] text-foreground mt-0.5">{task.solicitudPlazo.motivo}</p>
                                {task.solicitudPlazo.fechaPropuesta && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Nueva fecha propuesta: {format(new Date(task.solicitudPlazo.fechaPropuesta + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                  </p>
                                )}
                                {aceptandoPlazoId === task.id ? (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <input type="date" value={fechaAceptar} onChange={e => setFechaAceptar(e.target.value)}
                                      className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-foreground focus:outline-none" />
                                    <button onClick={() => handleAceptarPlazo(task)} disabled={!fechaAceptar || savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 145)" }}>
                                      {savingPlazo ? "…" : "Confirmar"}
                                    </button>
                                    <button onClick={() => { setAceptandoPlazoId(null); setFechaAceptar("") }}
                                      className="h-6 px-2 rounded-lg text-[11px] border border-border text-muted-foreground hover:text-foreground">
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2 mt-2">
                                    <button onClick={() => handleAceptarPlazo(task)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 145)" }}>
                                      {savingPlazo ? "…" : "✓ Aceptar"}
                                    </button>
                                    <button onClick={() => handleRechazarPlazo(task.id)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.50 0.22 25)" }}>
                                      {savingPlazo ? "…" : "✗ Rechazar"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Resultado de plazo — dentro del panel de edición */}
                          {task.plazoAceptado && (
                            <div className="px-3 py-2 rounded-lg"
                              style={{ background: "oklch(0.62 0.20 145 / 0.12)", border: "1px solid oklch(0.62 0.20 145 / 0.35)" }}>
                              <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.20 145)" }}>✓ Solicitud de tiempo aceptada</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Nueva fecha límite: {format(new Date(task.plazoAceptado.nuevaFecha + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                              </p>
                            </div>
                          )}
                          {task.plazoRechazado && (
                            <div className="px-3 py-2 rounded-lg"
                              style={{ background: "oklch(0.62 0.22 25 / 0.12)", border: "1px solid oklch(0.62 0.22 25 / 0.35)" }}>
                              <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.22 25)" }}>✗ Solicitud de tiempo rechazada</p>
                            </div>
                          )}

                          {/* Solicitud de más tiempo — dentro del formulario (dueño de la tarea) */}
                          {isOwnProfile && task.estado !== "Hecha" && !task.plazoAceptado && !task.plazoRechazado && (
                            <div className="pt-3 border-t border-border space-y-2">
                              <p className="text-[12px] font-semibold text-foreground">⏳ Solicitar más tiempo</p>
                              {task.solicitudPlazo && editandoSolicitudId !== task.id ? (
                                <div className="px-3 py-2 rounded-lg space-y-1"
                                  style={{ background: "oklch(0.68 0.18 55 / 0.10)", border: "1px solid oklch(0.68 0.18 55 / 0.30)" }}>
                                  <p className="text-[11px] font-bold" style={{ color: "oklch(0.58 0.20 55)" }}>Solicitud enviada</p>
                                  <p className="text-[12px] text-foreground">{task.solicitudPlazo.motivo}</p>
                                  {task.solicitudPlazo.fechaPropuesta && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Fecha propuesta: {format(new Date(task.solicitudPlazo.fechaPropuesta + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                    </p>
                                  )}
                                  <div className="flex gap-3 mt-1">
                                    <button onClick={() => { setEditandoSolicitudId(task.id); setSolicitudMotivo(task.solicitudPlazo.motivo || ""); setSolicitudFecha(task.solicitudPlazo.fechaPropuesta || "") }}
                                      className="text-[11px] font-medium hover:opacity-70 transition-opacity" style={{ color: "oklch(0.58 0.20 55)" }}>
                                      ✏ Editar solicitud
                                    </button>
                                    <button onClick={async () => { await cancelarPlazoTask(id, task.id); setTasks(await getTasks(id)) }}
                                      className="text-[11px] text-destructive hover:opacity-70 transition-opacity">
                                      Cancelar solicitud
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <textarea
                                    value={solicitudMotivo}
                                    onChange={e => setSolicitudMotivo(e.target.value)}
                                    placeholder="¿Por qué necesitas más tiempo?"
                                    rows={2}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
                                  />
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <input type="date" value={solicitudFecha}
                                      onChange={e => setSolicitudFecha(e.target.value)}
                                      className="bg-muted/50 border border-border rounded-xl px-3 py-1.5 text-[12px] text-foreground focus:outline-none" />
                                    <span className="text-[11px] text-muted-foreground">fecha propuesta (opcional)</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => { handleSolicitarPlazo(task.id); setEditandoSolicitudId(null) }}
                                      disabled={savingSolicitud || !solicitudMotivo.trim()}
                                      className="h-7 px-3 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.58 0.20 55)" }}>
                                      {savingSolicitud ? "Enviando…" : "Enviar solicitud"}
                                    </button>
                                    <button onClick={() => { setEditandoSolicitudId(null); setSolicitudMotivo(""); setSolicitudFecha(""); if (!task.solicitudPlazo) setEditingTaskId(null) }}
                                      className="h-7 px-3 rounded-lg text-[11px] border border-border text-muted-foreground hover:text-foreground">
                                      Cancelar
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ── Vista normal ── */
                        <div className="flex gap-3 items-start">
                          <button
                            onClick={() => handleUpdateTaskStatus(task.id,
                              task.estado === "Pendiente" ? "En proceso" : task.estado === "En proceso" ? "Hecha" : "Pendiente")}
                            className="w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 transition-all hover:scale-110"
                            style={{ borderColor: st.color, backgroundColor: task.estado === "Hecha" ? st.color : "transparent" }}
                            title="Cambiar estado">
                            {task.estado === "Hecha" && (
                              <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                            {task.estado === "En proceso" && (
                              <div className="w-full h-full rounded-sm" style={{ backgroundColor: st.color, margin: "2px" }} />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-[14px] font-semibold leading-snug ${task.estado === "Hecha" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {task.titulo}
                              </p>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{ color: st.color, backgroundColor: st.bg }}>
                                  {task.estado}
                                </span>
                                {isAdmin && (
                                  <button onClick={() => { setEditingTaskId(task.id); setSolicitudMotivo(""); setSolicitudFecha(""); setEditingTaskForm({ titulo: task.titulo, descripcion: task.descripcion || "", fechaInicio: task.fechaInicio || "", fechaLimite: task.fechaLimite || "", avance: task.avance ?? 0 }) }}
                                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                )}
                                {isOwnProfile && task.estado !== "Hecha" && !task.solicitudPlazo && !task.plazoAceptado && !task.plazoRechazado && (
                                  <button onClick={() => { setEditingTaskId(task.id); setSolicitudMotivo(""); setSolicitudFecha(""); setEditingTaskForm({ titulo: task.titulo, descripcion: task.descripcion || "", fechaInicio: task.fechaInicio || "", fechaLimite: task.fechaLimite || "", avance: task.avance ?? 0 }) }}
                                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                                    title="Solicitar más tiempo">
                                    ⏳
                                  </button>
                                )}
                                {isAdmin && (
                                  <button onClick={() => handleDeleteTask(task.id)}
                                    className="text-[11px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-70">
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                            {task.descripcion && (
                              <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{task.descripcion}</p>
                            )}
                            {/* Avance — slider interactivo para el dueño no-admin, barra de solo lectura para el resto */}
                            {isOwnProfile && !isAdmin && task.estado !== "Hecha" ? (
                              <div className="mt-2">
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-muted-foreground font-medium">Avance</span>
                                  <span className="font-bold tabular-nums" style={{ color: (taskAvanceLocal[task.id] ?? task.avance ?? 0) >= 100 ? "oklch(0.55 0.18 145)" : (taskAvanceLocal[task.id] ?? task.avance ?? 0) >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)" }}>
                                    {taskAvanceLocal[task.id] ?? task.avance ?? 0}%
                                  </span>
                                </div>
                                <input type="range" min="0" max="100" step="5"
                                  value={taskAvanceLocal[task.id] ?? task.avance ?? 0}
                                  onChange={e => setTaskAvanceLocal(prev => ({ ...prev, [task.id]: Number(e.target.value) }))}
                                  disabled={savingAvance === task.id}
                                  className="w-full accent-primary disabled:opacity-50" />
                                {taskAvanceLocal[task.id] != null && taskAvanceLocal[task.id] !== (task.avance ?? 0) && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <button onClick={() => handleUpdateAvance(task.id, taskAvanceLocal[task.id])}
                                      disabled={savingAvance === task.id}
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 260)" }}>
                                      {savingAvance === task.id ? "Guardando…" : "Guardar avance"}
                                    </button>
                                    <button onClick={() => setTaskAvanceLocal(prev => { const n = { ...prev }; delete n[task.id]; return n })}
                                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                      Descartar
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (task.avance != null && task.avance > 0) && (
                              <div className="mt-2">
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-muted-foreground">Avance</span>
                                  <span className="font-semibold" style={{ color: task.avance >= 100 ? "oklch(0.55 0.18 145)" : task.avance >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)" }}>
                                    {task.avance}%
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                                  <div className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${task.avance}%`,
                                      background: task.avance >= 100 ? "oklch(0.55 0.18 145)" : task.avance >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)",
                                    }} />
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {task.fechaInicio && (
                                <span className="text-[11px] text-muted-foreground">
                                  Inicio: {format(new Date(task.fechaInicio + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                </span>
                              )}
                              {task.fechaLimite && (
                                <span className={`text-[11px] font-medium ${vencida ? "text-destructive" : "text-muted-foreground"}`}>
                                  {vencida ? "⚠ Vencida · " : "Límite: "}
                                  {format(new Date(task.fechaLimite + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground/60">De: {task.creadoPorNombre}</span>
                            </div>

                            {/* Solicitud de plazo — admin ve el aviso */}
                            {task.solicitudPlazo && isAdmin && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.68 0.18 55 / 0.10)", border: "1px solid oklch(0.68 0.18 55 / 0.30)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.58 0.20 55)" }}>
                                  ⏰ Solicitud de más tiempo · {task.solicitudPlazo.solicitadoPor}
                                </p>
                                <p className="text-[12px] text-foreground mt-0.5">{task.solicitudPlazo.motivo}</p>
                                {task.solicitudPlazo.fechaPropuesta && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Fecha propuesta: {format(new Date(task.solicitudPlazo.fechaPropuesta + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                  </p>
                                )}
                                {aceptandoPlazoId === task.id ? (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <input type="date" value={fechaAceptar} onChange={e => setFechaAceptar(e.target.value)}
                                      className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-foreground focus:outline-none" />
                                    <button onClick={() => handleAceptarPlazo(task)} disabled={!fechaAceptar || savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 145)" }}>
                                      {savingPlazo ? "…" : "Confirmar"}
                                    </button>
                                    <button onClick={() => { setAceptandoPlazoId(null); setFechaAceptar("") }}
                                      className="h-6 px-2 rounded-lg text-[11px] border border-border text-muted-foreground hover:text-foreground">
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2 mt-2">
                                    <button onClick={() => handleAceptarPlazo(task)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 145)" }}>
                                      {savingPlazo ? "…" : "✓ Aceptar"}
                                    </button>
                                    <button onClick={() => handleRechazarPlazo(task.id)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.50 0.22 25)" }}>
                                      {savingPlazo ? "…" : "✗ Rechazar"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Confirmación visible en la tarjeta una vez enviada */}
                            {task.solicitudPlazo && isOwnProfile && !isAdmin && (
                              <p className="text-[11px] mt-1.5 font-medium" style={{ color: "oklch(0.58 0.20 55)" }}>
                                ⏰ Solicitud de más tiempo enviada
                              </p>
                            )}

                            {/* Resultado de solicitud de plazo */}
                            {task.plazoAceptado && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.62 0.20 145 / 0.12)", border: "1px solid oklch(0.62 0.20 145 / 0.35)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.20 145)" }}>✓ Solicitud de tiempo aceptada</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Nueva fecha límite: {format(new Date(task.plazoAceptado.nuevaFecha + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                </p>
                              </div>
                            )}
                            {task.plazoRechazado && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.62 0.22 25 / 0.12)", border: "1px solid oklch(0.62 0.22 25 / 0.35)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.22 25)" }}>✗ Solicitud de tiempo rechazada</p>
                              </div>
                            )}

                            {/* Archivos adjuntos de la tarea */}
                            {(isOwnProfile || isAdmin) && (
                              <div className="mt-2 pt-2 border-t border-border">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => setOpenTaskFiles(prev => { const s = new Set(prev); s.has(task.id) ? s.delete(task.id) : s.add(task.id); return s })}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                                    <span>Archivos</span>
                                    {(task.archivos?.length > 0) && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ background: "oklch(0.60 0.18 260 / 0.15)", color: "oklch(0.55 0.18 260)" }}>
                                        {task.archivos.length}
                                      </span>
                                    )}
                                    <span className="text-[9px] opacity-40">{openTaskFiles.has(task.id) ? "▲" : "▼"}</span>
                                  </button>
                                  <button
                                    onClick={() => { uploadingTaskIdRef.current = task.id; taskFileInputRef.current?.click() }}
                                    disabled={taskFileProgress !== null}
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                                    style={{ background: "oklch(0.55 0.18 260)" }}>
                                    {taskFileProgress?.taskId === task.id ? `${taskFileProgress.progress}%` : "↑ Subir"}
                                  </button>
                                </div>
                                {taskFileProgress?.taskId === task.id && (
                                  <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5">
                                    <div className="h-full rounded-full transition-all"
                                      style={{ width: `${taskFileProgress.progress}%`, background: "oklch(0.55 0.18 260)" }} />
                                  </div>
                                )}
                                {taskFileError && taskFileProgress === null && (
                                  <p className="text-[10px] text-destructive mt-1">{taskFileError}</p>
                                )}
                                {openTaskFiles.has(task.id) && (
                                  <div className="mt-1.5 space-y-1">
                                    {!task.archivos?.length ? (
                                      <p className="text-[10px] text-muted-foreground italic py-1">Sin archivos adjuntos.</p>
                                    ) : task.archivos.map((arch, ai) => {
                                      const fi = getFileTypeInfo(arch.tipo, arch.nombre)
                                      return (
                                        <div key={ai} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                                            style={{ background: fi.bg, color: fi.color }}>{fi.label}</span>
                                          <span className="text-[11px] text-foreground truncate flex-1 min-w-0">{arch.nombre}</span>
                                          {arch.size && <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatFileSize(arch.size)}</span>}
                                          <button type="button" onClick={() => downloadFile(arch.url, arch.nombre)}
                                            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Descargar">↓</button>
                                          {(isAdmin || isOwnProfile) && (
                                            <button onClick={() => handleDeleteTaskFile(task.id, arch)}
                                              className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">✕</button>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground bg-card border border-border rounded-2xl">
                <p className="text-[13px]">
                  {isAdmin ? "Sin tareas asignadas aún." : "No tienes tareas pendientes."}
                </p>
              </div>
            )}
          </div>
        )}

        </>)}

        {/* Input oculto para archivos de tareas */}
        <input ref={taskFileInputRef} type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          className="hidden" onChange={handleTaskFileSelected} />

        </main>
        <Footer />
      </div>
    </div>
  )
}
