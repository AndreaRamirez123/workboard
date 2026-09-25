import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth, SUPER_ADMIN_EMAILS } from "@/context/AuthContext"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { Footer } from "@/components/ui/Footer"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import EmojiPicker from "emoji-picker-react"
import {
  getGrupo, addGrupoProject, deleteGrupoProject, updateGrupoProject,
  addGrupoLog, getGrupoLogs, deleteGrupoLog, updateGrupoLog,
  addGrupoTask, getGrupoTasks, updateGrupoTask, updateGrupoTaskStatus, deleteGrupoTask, updateGrupoTaskAvance,
  addGrupoFeedback, getGrupoFeedback, deleteGrupoFeedback, updateGrupoFeedback,
  solicitarPlazoGrupoTask, aceptarPlazoGrupoTask, rechazarPlazoGrupoTask, dismissPlazoGrupoResultado,
  addGrupoTaskFile, removeGrupoTaskFile,
  importGroupContacts, getGroupContacts, deleteGroupContact, deleteAllGroupContacts,
} from "@/services/groups.service"
import { parseContactsFile } from "@/utils/parseContactsFile"
import { extractPdfText, parseCunPdf } from "@/utils/parsePropuesta"
import { notificarTareaCompletada, crearNotificacionUsuario } from "@/services/notificaciones.service"
import { getColleagues, addProject } from "@/services/colleagues.service"
import { uploadGroupDocument, getGroupDocuments, deleteGroupDocument, uploadGrupoTaskFile, deleteTaskFile, uploadAttachment, MAX_FILE_SIZE } from "@/services/storage.service"
import { Pencil, Trash2, Check, X, Plus } from "lucide-react"
import { doc, updateDoc, arrayUnion } from "firebase/firestore"
import { db } from "@/services/firebase"
import { downloadFile } from "@/utils/download"

function getFileTypeInfo(tipo, nombre) {
  const ext = (nombre || "").split(".").pop().toLowerCase()
  if (tipo?.includes("pdf") || ext === "pdf")       return { label: "PDF", color: "oklch(0.50 0.22 27)",  bg: "oklch(0.65 0.22 27 / 0.15)"  }
  if (tipo?.includes("word") || ["doc","docx"].includes(ext)) return { label: "DOC", color: "oklch(0.50 0.20 260)", bg: "oklch(0.62 0.18 260 / 0.15)" }
  if (tipo?.includes("sheet") || tipo?.includes("excel") || ["xls","xlsx"].includes(ext)) return { label: "XLS", color: "oklch(0.50 0.18 145)", bg: "oklch(0.55 0.18 145 / 0.15)" }
  if (tipo?.includes("presentation") || ["ppt","pptx"].includes(ext)) return { label: "PPT", color: "oklch(0.55 0.22 35)", bg: "oklch(0.65 0.20 35 / 0.15)" }
  if (tipo?.includes("image") || ["jpg","jpeg","png","gif","webp"].includes(ext)) return { label: "IMG", color: "oklch(0.50 0.18 295)", bg: "oklch(0.62 0.18 295 / 0.15)" }
  return { label: "FILE", color: "oklch(0.55 0.04 270)", bg: "oklch(0.55 0.04 270 / 0.15)" }
}

function formatFileSize(bytes) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


const ESTADOS = ["Planificación", "En desarrollo", "En revisión", "Finalizado", "Pausado", "Entregado"]
const STATE_COLOR = {
  "Planificación": "260", "En desarrollo": "145", "En revisión": "55",
  "Finalizado": "145", "Pausado": "27", "Entregado": "295",
}

function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h * 137.508) % 360
}

function avanceColor(v) {
  return v >= 75 ? "oklch(0.55 0.18 145)" : v >= 50 ? "oklch(0.55 0.18 260)" : v >= 25 ? "oklch(0.60 0.18 55)" : "oklch(0.60 0.20 27)"
}

const EMPTY_PROJECT = { nombre: "", estado: "En desarrollo", avance: 0, area: "", queHace: "", herramientas: "", fechaInicio: "", fechaEntrega: "", observaciones: "" }

export default function GroupDetail() {
  const { id, semilleroId } = useParams()
  const navigate = useNavigate()
  const { user, myColleagueId, isAdmin, isSuperAdmin } = useAuth()

  const [grupo, setGrupo] = useState(null)
  const [colleagues, setColleagues] = useState([])
  const [logs, setLogs] = useState([])
  const [tasks, setTasks] = useState([])
  const [feedback, setFeedback] = useState([])

  //Bitácora
  const [nota, setNota] = useState("")
  const [savingLog, setSavingLog] = useState(false)
  const [editingLogId, setEditingLogId] = useState(null)
  const [editingLogText, setEditingLogText] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const notaRef = useRef(null)
  const logAttachRef = useRef(null)
  const [logAttachFiles, setLogAttachFiles] = useState([])
  const [logAttachUploading, setLogAttachUploading] = useState(false)
  const newTaskAttachRef = useRef(null)
  const [newTaskAttachFiles, setNewTaskAttachFiles] = useState([])
  const [newTaskAttachUploading, setNewTaskAttachUploading] = useState(false)

  // Proyectos
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT)
  const [savingProject, setSavingProject] = useState(false)
  const [projectSearch, setProjectSearch] = useState("")
  const [returningProject, setReturningProject] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [pdfImported, setPdfImported] = useState(false)
  const pdfInputRef = useRef(null)
  const [returnTargetId, setReturnTargetId] = useState("")
  const [savingReturn, setSavingReturn] = useState(false)

  // Documentos
  const fileInputRef = useRef(null)
  const uploadingProjectRef = useRef(null) // ref para evitar stale closure
  const taskFileInputRef = useRef(null)
  const uploadingTaskIdRef = useRef(null)
  const [groupDocuments, setGroupDocuments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadError, setUploadError] = useState("")
  const [uploadingForProject, setUploadingForProject] = useState(null)
  const [openDocProjects, setOpenDocProjects] = useState(new Set())

  // Tareas
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskForm, setTaskForm] = useState({ titulo: "", descripcion: "", fechaInicio: "", fechaLimite: "", avance: 0 })
  const [savingTask, setSavingTask] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTaskForm, setEditingTaskForm] = useState({})
  const [solicitudPlazoId, setSolicitudPlazoId] = useState(null)
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

  // Retroalimentación
  const [feedbackText, setFeedbackText] = useState("")
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [editingFbId, setEditingFbId] = useState(null)
  const [editingFbText, setEditingFbText] = useState("")

  // Contactos importados
  const contactsInputRef = useRef(null)
  const [contacts, setContacts] = useState([])
  const [importPreview, setImportPreview] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState("")
  const [importSaving, setImportSaving] = useState(false)
  const [contactSearch, setContactSearch] = useState("")

  // Tabs / sidebar
  const [activeTab, setActiveTab] = useState("proyectos")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showMemberManager, setShowMemberManager] = useState(false)

  const [loadingData, setLoadingData] = useState(true)

  // ── Carga de datos ──────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoadingData(true)
    try {
      const [g, cols] = await Promise.all([getGrupo(id), getColleagues()])
      setGrupo(g)
      setColleagues(cols)
      // compute membership immediately so we can gate the rest
      const member = g && (g.miembros || []).some(cid => {
        const c = cols.find(col => col.id === cid)
        return c && (c.uid === user?.uid || c.email === user?.email)
      })
      if (isAdmin || member) {
        const [ls, ts, fb, docs] = await Promise.all([
          getGrupoLogs(id),
          getGrupoTasks(id),
          getGrupoFeedback(id),
          getGroupDocuments(id),
        ])
        setLogs(ls)
        setTasks(ts)
        setFeedback(fb)
        setGroupDocuments(docs)
      }
    } finally { setLoadingData(false) }
  }

  useEffect(() => { loadAll() }, [id])

  // Carga de contactos separada
  useEffect(() => {
    if (!id || !user) return
    getGroupContacts(id)
      .then(cts => setContacts(cts))
      .catch(() => setContacts([]))
  }, [id, user])

  const isMember = grupo && (grupo.miembros || []).some(cid => {
    const c = colleagues.find(col => col.id === cid)
    return c && (c.uid === user?.uid || c.email === user?.email)
  })
  const canAccess = isAdmin || isMember
  const canLog = isAdmin || isMember

  // ── Importar contactos desde Excel/CSV ───────────────────────────────────
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
    if (!importPreview?.length) return
    setImportSaving(true)
    try {
      await importGroupContacts(id, importPreview, user?.email)
      const updated = await getGroupContacts(id)
      setContacts(updated)
      setImportPreview(null)
    } catch (err) {
      setImportError("Error al guardar los contactos. Intenta de nuevo.")
    } finally {
      setImportSaving(false)
    }
  }

  const handleDeleteContact = async (contactId) => {
    await deleteGroupContact(id, contactId)
    setContacts(prev => prev.filter(c => c.id !== contactId))
  }

  const handleDeleteAllContacts = async () => {
    if (!window.confirm(`¿Eliminar todos los contactos importados de este grupo?`)) return
    await deleteAllGroupContacts(id)
    setContacts([])
  }

  // ── Documentos de grupo ───────────────────────────────────────────────────
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    // Usar el ref como fuente de verdad (evita stale closure de estado React)
    const proyNombre = uploadingProjectRef.current
    if (!proyNombre) return
    if (file.size > MAX_FILE_SIZE) { setUploadError("El archivo supera el límite de 15 MB."); return }
    setUploadError("")
    setUploadProgress(0)
    try {
      const newDoc = await uploadGroupDocument(id, file, {
        onProgress: setUploadProgress,
        uploadedBy: user?.uid,
        uploadedByName: user?.displayName || user?.email,
        proyectoNombre: String(proyNombre),
      })
      setGroupDocuments(prev => [newDoc, ...prev])
    } catch (err) {
      console.error("[Workboard] Error subiendo archivo al grupo:", err)
      setUploadError("No se pudo subir el archivo.")
    } finally {
      setUploadProgress(null)
      uploadingProjectRef.current = null
    }
  }

  const handleDeleteGroupDoc = async (d) => {
    if (!window.confirm(`¿Eliminar "${d.nombre}"?`)) return
    try {
      await deleteGroupDocument(id, d.id, d.storagePath)
      setGroupDocuments(prev => prev.filter(x => x.id !== d.id))
    } catch (err) { console.error(err) }
  }

  // ── Adjuntos genéricos (bitácora y nueva tarea) ───────────────────────────
  const handleGrupoAttach = async (file, basePath, onAdd, setUploading) => {
    if (file.size > MAX_FILE_SIZE) { alert("El archivo supera los 15 MB."); return }
    setUploading(true)
    try {
      const meta = await uploadAttachment(basePath, file)
      onAdd(meta)
    } catch { alert("No se pudo subir el archivo.") }
    finally { setUploading(false) }
  }

  // ── Bitácora ─────────────────────────────────────────────────────────────
  const handleAddLog = async () => {
    if (!nota.trim()) return
    setSavingLog(true)
    try {
      await addGrupoLog(id, nota.trim(), user, logAttachFiles)
      setNota("")
      setLogAttachFiles([])
      setLogs(await getGrupoLogs(id))
    } finally { setSavingLog(false) }
  }

  const handleDeleteLog = async (logId) => {
    await deleteGrupoLog(id, logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  const handleSaveEditLog = async (logId) => {
    if (!editingLogText.trim()) return
    await updateGrupoLog(id, logId, editingLogText.trim())
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, nota: editingLogText.trim() } : l))
    setEditingLogId(null)
  }

  // ── Proyectos ─────────────────────────────────────────────────────────────
  const handleSaveProject = async () => {
    if (!projectForm.nombre.trim()) return
    setSavingProject(true)
    try {
      const data = {
        ...projectForm,
        avance: Number(projectForm.avance),
        herramientas: projectForm.herramientas ? projectForm.herramientas.split(",").map(s => s.trim()).filter(Boolean) : [],
      }
      if (editingProject) {
        await updateGrupoProject(id, editingProject, data)
      } else {
        await addGrupoProject(id, data)
        notificarMiembros({
          tipo: "proyecto_grupo",
          titulo: `Nueva actividad en "${grupo?.nombre}"`,
          subtitulo: data.nombre,
          path: `/semillero/${semilleroId}/grupo/${id}`,
        })
      }
      const g = await getGrupo(id)
      setGrupo(g)
      setShowProjectForm(false)
      setEditingProject(null)
      setProjectForm(EMPTY_PROJECT)
    } finally { setSavingProject(false) }
  }

  const handlePdfImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setPdfLoading(true)
    setPdfError(null)
    setPdfImported(false)
    try {
      const rawText = await extractPdfText(file)
      const fields = parseCunPdf(rawText)
      if (Object.keys(fields).length === 0) {
        setPdfError("No se reconoció el formato. Verifica que sea un PDF del Asistente CUN.")
        return
      }
      setProjectForm(prev => ({
        ...prev,
        ...(fields.nombre        && { nombre: fields.nombre }),
        ...(fields.area          && { area: fields.area }),
        ...(fields.queHace       && { queHace: fields.queHace }),
        ...(fields.herramientas  && { herramientas: fields.herramientas }),
        ...(fields.observaciones && { observaciones: fields.observaciones }),
        ...(fields.fechaInicio   && { fechaInicio: fields.fechaInicio }),
        ...(fields.fechaEntrega  && { fechaEntrega: fields.fechaEntrega }),
      }))
      setPdfImported(true)
    } catch (err) {
      console.error("[Workboard] Error parseando PDF:", err)
      setPdfError("No se pudo leer el archivo. Asegúrate de que sea un PDF válido.")
    } finally {
      setPdfLoading(false)
    }
  }

  const handleDeleteProject = async (proyecto) => {
    await deleteGrupoProject(id, proyecto)
    setGrupo(prev => ({ ...prev, proyectos: (prev.proyectos || []).filter(p => p !== proyecto) }))
  }

  const handleReturnProject = (proyecto) => {
    if (proyecto.enrutadoDe) {
      // Nuevo comportamiento: el proyecto ya está en el perfil individual, solo quitar del grupo
      deleteGrupoProject(id, proyecto)
      setGrupo(prev => ({ ...prev, proyectos: (prev.proyectos || []).filter(p => p !== proyecto) }))
    } else {
      // Proyecto antiguo (enrutado antes del fix): hay que elegir a qué compañera devolverlo
      setReturnTargetId("")
      setReturningProject(proyecto)
    }
  }

  const handleConfirmReturn = async () => {
    const targetId = returnTargetId || miembros[0]?.id
    if (!returningProject || !targetId) return
    setSavingReturn(true)
    try {
      const { enrutadoDe, ...raw } = returningProject
      // Normalizar al formato exacto que espera el perfil individual (ProjectForm)
      const projectData = {
        nombre: raw.nombre || "",
        estado: raw.estado || "",
        avance: Number(raw.avance) || 0,
        area: raw.area || "",
        queHace: raw.queHace || "",
        herramientas: Array.isArray(raw.herramientas)
          ? raw.herramientas
          : (raw.herramientas || "").split(",").map(h => h.trim()).filter(Boolean),
        observaciones: raw.observaciones || "",
        fechaInicio: raw.fechaInicio || "",
        fechaEntrega: raw.fechaEntrega || "",
        versiones: raw.versiones || [],
      }
      await addProject(targetId, projectData)
      await deleteGrupoProject(id, returningProject)
      setGrupo(prev => ({ ...prev, proyectos: (prev.proyectos || []).filter(p => p !== returningProject) }))
      setReturningProject(null)
    } catch (err) {
      console.error("[Workboard] Error devolviendo proyecto a individual:", err)
    } finally {
      setSavingReturn(false)
    }
  }

  const openEditProject = (p) => {
    setEditingProject(p)
    setProjectForm({ ...p, herramientas: (p.herramientas || []).join(", ") })
    setShowProjectForm(true)
  }

  // Notifica a todos los miembros del grupo que no son admin
  const notificarMiembros = ({ tipo, titulo, subtitulo, path: p }) => {
    const memberColleagues = colleagues.filter(c => (grupo?.miembros || []).includes(c.id))
    memberColleagues.forEach(c => {
      if (!c.uid || SUPER_ADMIN_EMAILS.includes(c.email)) return
      crearNotificacionUsuario({ toUid: c.uid, tipo, titulo, subtitulo, path: p, semilleroId }).catch(() => {})
    })
  }

  // ── Tareas ────────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!taskForm.titulo.trim()) return
    setSavingTask(true)
    try {
      const taskRef = await addGrupoTask(id, taskForm)
      if (newTaskAttachFiles.length > 0 && taskRef?.id) {
        await updateDoc(doc(db, "equipos", id, "tareas", taskRef.id), { archivos: arrayUnion(...newTaskAttachFiles) }).catch(() => {})
      }
      setNewTaskAttachFiles([])
      if (Number(taskForm.avance) >= 100) {
        notificarTareaCompletada({ taskTitle: taskForm.titulo.trim(), grupoNombre: grupo?.nombre, path: `/semillero/${semilleroId}/grupo/${id}`, semilleroId }).catch(() => {})
      }
      notificarMiembros({
        tipo: "tarea_grupo",
        titulo: `Nueva tarea en "${grupo?.nombre}"`,
        subtitulo: taskForm.titulo.trim(),
        path: `/semillero/${semilleroId}/grupo/${id}`,
      })
      setTasks(await getGrupoTasks(id))
      setTaskForm({ titulo: "", descripcion: "", fechaInicio: "", fechaLimite: "", avance: 0 })
      setShowTaskForm(false)
    } finally { setSavingTask(false) }
  }

  const handleTaskStatus = async (taskId, estado) => {
    await updateGrupoTaskStatus(id, taskId, estado)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, estado } : t))
    if (estado === "Hecho") {
      const task = tasks.find(t => t.id === taskId)
      notificarTareaCompletada({
        taskTitle: task?.titulo,
        grupoNombre: grupo?.nombre,
        path: `/semillero/${semilleroId}/grupo/${id}`,
        semilleroId,
      }).catch(() => {})
      notificarMiembros({
        tipo: "tarea_completada_grupo",
        titulo: `Tarea completada en "${grupo?.nombre}"`,
        subtitulo: task?.titulo,
        path: `/semillero/${semilleroId}/grupo/${id}`,
      })
    }
  }

  const handleDeleteTask = async (taskId) => {
    await deleteGrupoTask(id, taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const handleSolicitarPlazo = async (taskId) => {
    if (!solicitudMotivo.trim()) return
    setSavingSolicitud(true)
    const miembrosLocal = (grupo?.miembros || []).map(cid => colleagues.find(c => c.id === cid)).filter(Boolean)
    const yo = miembrosLocal.find(m => m.id === myColleagueId)
    try {
      await solicitarPlazoGrupoTask(id, taskId, {
        motivo: solicitudMotivo.trim(),
        fechaPropuesta: solicitudFecha || null,
        solicitadoPor: yo?.nombre || user?.displayName || user?.email,
        fecha: new Date().toISOString(),
      })
      setSolicitudPlazoId(null)
      setSolicitudMotivo("")
      setSolicitudFecha("")
      setTasks(await getGrupoTasks(id))
      notificarTareaCompletada({
        tipo: "plazo_solicitado",
        taskTitle: `Solicitud de plazo en "${grupo?.nombre}"`,
        assigneeName: yo?.nombre || user?.displayName || user?.email,
        path: `/semillero/${semilleroId}/grupo/${id}`,
        semilleroId,
      }).catch(() => {})
    } catch (err) {
      console.error("[Workboard] Error solicitando plazo grupo:", err)
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
      await aceptarPlazoGrupoTask(id, task.id, fechaPropuesta || fechaAceptar)
      setAceptandoPlazoId(null)
      setFechaAceptar("")
      setTasks(await getGrupoTasks(id))
    } catch (err) {
      console.error("[Workboard] Error aceptando plazo grupo:", err)
    } finally {
      setSavingPlazo(false)
    }
  }

  const handleRechazarPlazo = async (taskId) => {
    setSavingPlazo(true)
    try {
      await rechazarPlazoGrupoTask(id, taskId)
      setTasks(await getGrupoTasks(id))
    } catch (err) {
      console.error("[Workboard] Error rechazando plazo grupo:", err)
    } finally {
      setSavingPlazo(false)
    }
  }

  const handleUpdateAvance = async (taskId, newAvance) => {
    setSavingAvance(taskId)
    try {
      const task = tasks.find(t => t.id === taskId)
      const nuevoEstado = newAvance >= 100 ? "Hecho" : undefined
      await updateGrupoTaskAvance(id, taskId, newAvance, nuevoEstado)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, avance: newAvance, ...(nuevoEstado ? { estado: nuevoEstado } : {}) } : t))
      if (newAvance >= 100 && task?.estado !== "Hecho") {
        notificarTareaCompletada({ taskTitle: task?.titulo, grupoNombre: grupo?.nombre, path: `/semillero/${semilleroId}/grupo/${id}`, semilleroId }).catch(() => {})
        notificarMiembros({ tipo: "tarea_completada_grupo", titulo: `Tarea completada en "${grupo?.nombre}"`, subtitulo: task?.titulo, path: `/semillero/${semilleroId}/grupo/${id}` })
      }
    } catch (err) {
      console.error("[Workboard] Error actualizando avance de tarea:", err)
    } finally {
      setSavingAvance(null)
      setTaskAvanceLocal(prev => { const n = { ...prev }; delete n[taskId]; return n })
    }
  }

  const handleGroupTaskFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const taskId = uploadingTaskIdRef.current
    if (!taskId) return
    if (file.size > MAX_FILE_SIZE) { setTaskFileError("El archivo supera 15 MB."); return }
    setTaskFileError("")
    setTaskFileProgress({ taskId, progress: 0 })
    try {
      const archivo = await uploadGrupoTaskFile(id, taskId, file, { onProgress: p => setTaskFileProgress({ taskId, progress: p }) })
      await addGrupoTaskFile(id, taskId, archivo)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, archivos: [...(t.archivos || []), archivo] } : t))
    } catch (err) {
      console.error("[Workboard] Error subiendo archivo de tarea:", err)
      setTaskFileError("Error al subir el archivo.")
    } finally {
      setTaskFileProgress(null)
      uploadingTaskIdRef.current = null
    }
  }

  const handleDeleteGroupTaskFile = async (taskId, archivo) => {
    if (!window.confirm(`¿Eliminar "${archivo.nombre}"?`)) return
    try {
      await deleteTaskFile(archivo.storagePath)
      await removeGrupoTaskFile(id, taskId, archivo)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, archivos: (t.archivos || []).filter(a => a.storagePath !== archivo.storagePath) } : t))
    } catch (err) {
      console.error("[Workboard] Error eliminando archivo de tarea:", err)
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
    await updateGrupoTask(id, task.id, data)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...data } : t))
    if (prevAvance < 100 && newAvance >= 100) {
      notificarTareaCompletada({ taskTitle: data.titulo, grupoNombre: grupo?.nombre, path: `/semillero/${semilleroId}/grupo/${id}`, semilleroId }).catch(() => {})
    }
    setEditingTaskId(null)
  }

  // ── Retroalimentación ─────────────────────────────────────────────────────
  const handleAddFeedback = async () => {
    if (!feedbackText.trim()) return
    setSavingFeedback(true)
    try {
      await addGrupoFeedback(id, feedbackText.trim(), user)
      // Notificar a los miembros del grupo
      notificarMiembros({
        tipo: "feedback_grupo",
        titulo: `Nuevo feedback en "${grupo?.nombre}"`,
        subtitulo: feedbackText.trim().slice(0, 80),
        path: `/semillero/${semilleroId}/grupo/${id}`,
      })
      setFeedbackText("")
      setFeedback(await getGrupoFeedback(id))
    } finally { setSavingFeedback(false) }
  }

  const handleDeleteFeedback = async (fbId) => {
    await deleteGrupoFeedback(id, fbId)
    setFeedback(prev => prev.filter(f => f.id !== fbId))
  }

  const handleSaveEditFeedback = async (fbId) => {
    if (!editingFbText.trim()) return
    await updateGrupoFeedback(id, fbId, editingFbText.trim())
    setFeedback(prev => prev.map(f => f.id === fbId ? { ...f, texto: editingFbText.trim() } : f))
    setEditingFbId(null)
  }

  const handleToggleMember = async (colleagueId) => {
    const miembrosActuales = grupo.miembros || []
    const c = colleagues.find(col => col.id === colleagueId)
    const memberUids = grupo.memberUids || []
    const isNowMember = miembrosActuales.includes(colleagueId)
    const newMiembros = isNowMember ? miembrosActuales.filter(m => m !== colleagueId) : [...miembrosActuales, colleagueId]
    const newMemberUids = c?.uid
      ? (isNowMember ? memberUids.filter(u => u !== c.uid) : [...memberUids, c.uid])
      : memberUids
    await updateDoc(doc(db, "equipos", id), { miembros: newMiembros, memberUids: newMemberUids })
    setGrupo(prev => ({ ...prev, miembros: newMiembros, memberUids: newMemberUids }))
  }

  if (loadingData || !grupo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-6 h-6 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-[15px] font-semibold text-foreground">Sin acceso</p>
        <p className="text-[13px] text-muted-foreground">Solo los miembros del grupo pueden ver este contenido.</p>
        <button onClick={() => navigate(`/semillero/${semilleroId}/dashboard`)} className="text-[13px] text-primary hover:underline mt-2">← Volver al dashboard</button>
      </div>
    )
  }

  const hue = grupo.color || "295"
  const miembros = (grupo.miembros || []).map(cid => colleagues.find(c => c.id === cid)).filter(Boolean)
  const proyectos = (grupo.proyectos || []).filter(p =>
    !projectSearch || p.nombre?.toLowerCase().includes(projectSearch.toLowerCase())
  )
  const tareasPendientes = tasks.filter(t => t.estado !== "Hecho")
  const tareasHechas = tasks.filter(t => t.estado === "Hecho")

  const inputCls = "w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/30"
  const labelCls = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1"
  const sectionHeaderCls = "flex items-center justify-between mb-4 cursor-pointer select-none"


  return (
    <div className="min-h-screen bg-background flex">

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "oklch(0 0 0 / 45%)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-border/50 transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 272, background: "var(--sidebar)" }}>

        <div className="px-5 pt-5 pb-4 flex-shrink-0">
          <button onClick={() => { navigate(`/semillero/${semilleroId}/dashboard?tab=equipos`); setSidebarOpen(false) }}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            ← Volver a grupos
          </button>
        </div>

        <div className="mx-4 h-px bg-border/60 flex-shrink-0" />

        <div className="px-5 py-6 flex-shrink-0 text-center">
          <div className="w-[84px] h-[84px] rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-3"
            style={{
              background: `linear-gradient(135deg, oklch(0.62 0.18 ${hue}), oklch(0.52 0.22 ${(parseInt(hue) + 45) % 360}))`,
              boxShadow: `0 8px 28px oklch(0.52 0.18 ${hue} / 30%)`,
            }}>
            {grupo.nombre?.charAt(0).toUpperCase()}
          </div>
          <p className="text-[15px] font-bold text-foreground leading-snug">{grupo.nombre}</p>
          {grupo.descripcion && (
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{grupo.descripcion}</p>
          )}
          <span className="inline-block mt-2 text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `oklch(0.62 0.18 ${hue} / 0.12)`, color: `oklch(0.42 0.18 ${hue})` }}>
            Grupo
          </span>
        </div>

        <div className="mx-4 h-px bg-border/60 flex-shrink-0" />

        <div className="flex-1 px-4 overflow-y-auto">
          <div className="py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                Miembros — {miembros.length}
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowMemberManager(v => !v)}
                  className="text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors"
                  style={{ color: `oklch(0.52 0.22 ${hue})`, background: `oklch(0.62 0.18 ${hue} / 0.10)` }}>
                  <Pencil size={10} />
                  {showMemberManager ? "Listo" : "Gestionar"}
                </button>
              )}
            </div>

            {showMemberManager && isAdmin && (
              <div className="mb-4 space-y-1">
                <p className="text-[10px] text-muted-foreground mb-2">Toca para agregar/quitar:</p>
                {colleagues.map(c => {
                  const ch = c.colorHue ?? hashHue(c.id)
                  const isMem = (grupo.miembros || []).includes(c.id)
                  return (
                    <button key={c.id}
                      onClick={() => handleToggleMember(c.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all"
                      style={isMem ? {
                        background: `oklch(0.62 0.18 ${ch} / 0.10)`,
                        border: `1px solid oklch(0.62 0.18 ${ch} / 0.30)`,
                      } : {
                        background: "transparent",
                        border: "1px solid var(--border)",
                      }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                        style={{ background: c.avatarUrl ? "var(--muted)" : `oklch(0.68 0.18 ${ch})` }}>
                        {c.avatarUrl
                          ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                          : c.avatarEmoji
                            ? <span className="text-xs leading-none">{c.avatarEmoji}</span>
                            : c.nombre?.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-[12px] font-medium text-foreground truncate">{c.nombre?.split(" ").slice(0, 2).join(" ")}</span>
                      {isMem
                        ? <X size={11} style={{ color: "oklch(0.60 0.18 27)", flexShrink: 0 }} />
                        : <Plus size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
                      }
                    </button>
                  )
                })}
              </div>
            )}

            {!showMemberManager && (
              <div className="space-y-1.5">
                {/* Miembros del equipo */}
                {miembros.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground italic px-1">Sin miembros. Usa "Gestionar" para agregar.</p>
                ) : (
                  miembros.map(c => {
                    const ch = c.colorHue ?? hashHue(c.id)
                    const ch2 = c.colorHue2 ?? null
                    return (
                      <a key={c.id}
                        href={`/semillero/${semilleroId}/colleague/${c.id}`}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0 overflow-hidden"
                          style={{ background: c.avatarUrl ? "var(--muted)" : `linear-gradient(135deg, oklch(0.68 0.18 ${ch}), oklch(0.54 0.22 ${ch2 ?? (ch + 40) % 360}))` }}>
                          {c.avatarUrl
                            ? <img src={c.avatarUrl} alt={c.nombre} className="w-full h-full object-cover" />
                            : c.avatarEmoji
                              ? <span className="text-sm leading-none">{c.avatarEmoji}</span>
                              : c.nombre?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{c.nombre}</p>
                          {c.rol && <p className="text-[10px] text-muted-foreground truncate">{c.rol}</p>}
                        </div>
                      </a>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <style>{`@media (min-width: 1024px) { .gd-offset { margin-left: 272px; } }`}</style>
      <div className="gd-offset flex-1 flex flex-col min-h-screen">

        <header className="sticky top-0 z-20 border-b border-border/60"
          style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>
          <div className="h-14 px-5 flex items-center gap-3">
            <button className="lg:hidden text-muted-foreground hover:text-foreground text-xl leading-none"
              onClick={() => setSidebarOpen(v => !v)}>☰</button>
            <div className="flex-1" />
            <ThemeToggle />
          </div>
          <div className="flex border-t border-border/40 px-1 overflow-x-auto">
            {[
              ...(isAdmin ? [{ key: "resumen", label: "Resumen", count: 0 }] : []),
              { key: "proyectos", label: "Actividades", count: grupo.proyectos?.length || 0 },
              { key: "bitacora", label: "Bitácora", count: logs.length },
              { key: "tareas", label: "Tareas", count: tareasPendientes.length },
              { key: "feedback", label: "Retroalimentación", count: feedback.length },
              ...(isAdmin ? [{ key: "participantes", label: "Participantes", count: contacts.length }] : []),
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 transition-all -mb-px whitespace-nowrap"
                style={activeTab === t.key
                  ? { color: "var(--foreground)", borderBottomColor: `oklch(0.52 0.22 ${hue})` }
                  : { color: "var(--muted-foreground)", borderBottomColor: "transparent" }}>
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={activeTab === t.key
                      ? { background: `oklch(0.52 0.22 ${hue} / 0.14)`, color: `oklch(0.42 0.22 ${hue})` }
                      : { background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 px-6 py-6 space-y-5">

          {activeTab === "resumen" && isAdmin && (() => {
            const proyAll = grupo.proyectos || []
            const today = new Date().toISOString().slice(0, 10)
            const tareasVencidas = tasks.filter(t => t.estado !== "Hecho" && t.fechaLimite && t.fechaLimite < today)
            const avgAvance = proyAll.length > 0
              ? Math.round(proyAll.reduce((s, p) => s + (Number(p.avance) || 0), 0) / proyAll.length)
              : 0
            const byEstado = ESTADOS.map(est => ({
              est, color: STATE_COLOR[est] || "180",
              count: proyAll.filter(p => p.estado === est).length,
            })).filter(x => x.count > 0)
            const recentLogs = [...logs].slice(0, 5)
            const statCards = [
              { label: "Miembros", value: miembros.length, color: hue, sub: "en el grupo" },
              { label: "Actividades", value: proyAll.length, color: "145", sub: `${proyAll.filter(p => p.estado === "Finalizado" || p.estado === "Entregado").length} finalizados` },
              { label: "Tareas pendientes", value: tareasPendientes.length, color: tareasVencidas.length > 0 ? "27" : "55", sub: tareasVencidas.length > 0 ? `${tareasVencidas.length} vencida${tareasVencidas.length !== 1 ? "s" : ""}` : "al día" },
              { label: "Completadas", value: tareasHechas.length, color: "165", sub: `de ${tasks.length} tareas` },
            ]
            return (
              <div className="space-y-5">
                <h2 className="text-[18px] font-bold text-foreground tracking-tight">Resumen del grupo</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {statCards.map(s => (
                    <div key={s.label} className="bg-card border border-border rounded-2xl p-4 space-y-1"
                      style={{ borderTop: `3px solid oklch(0.62 0.20 ${s.color})` }}>
                      <p className="text-[28px] font-black text-foreground leading-none">{s.value}</p>
                      <p className="text-[12px] font-semibold text-foreground">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground">{s.sub}</p>
                    </div>
                  ))}
                </div>

                {proyAll.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                    <p className="text-[13px] font-bold text-foreground">Actividades</p>
                    <div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                        <span>Avance promedio</span>
                        <span className="font-semibold text-foreground">{avgAvance}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${avgAvance}%`, background: `oklch(0.55 0.18 ${hue})` }} />
                      </div>
                    </div>
                    {byEstado.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {byEstado.map(x => (
                          <div key={x.est} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                            style={{ background: `oklch(0.62 0.18 ${x.color} / 0.12)`, color: `oklch(0.45 0.18 ${x.color})` }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `oklch(0.60 0.20 ${x.color})` }} />
                            {x.est} · {x.count}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {proyAll.slice(0, 5).map((p, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <p className="text-[12px] text-foreground truncate flex-1">{p.nombre}</p>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0 w-8 text-right">{Number(p.avance) || 0}%</span>
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full" style={{ width: `${Number(p.avance) || 0}%`, background: `oklch(0.55 0.18 ${STATE_COLOR[p.estado] || hue})` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tasks.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <p className="text-[13px] font-bold text-foreground">Tareas</p>
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "oklch(0.55 0.18 145 / 0.10)" }}>
                        <p className="text-[22px] font-black" style={{ color: "oklch(0.48 0.18 145)" }}>{tareasHechas.length}</p>
                        <p className="text-[11px] text-muted-foreground">Completadas</p>
                      </div>
                      <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "oklch(0.55 0.18 55 / 0.10)" }}>
                        <p className="text-[22px] font-black" style={{ color: "oklch(0.50 0.18 55)" }}>{tareasPendientes.length}</p>
                        <p className="text-[11px] text-muted-foreground">Pendientes</p>
                      </div>
                      {tareasVencidas.length > 0 && (
                        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "oklch(0.55 0.18 27 / 0.10)" }}>
                          <p className="text-[22px] font-black" style={{ color: "oklch(0.50 0.20 27)" }}>{tareasVencidas.length}</p>
                          <p className="text-[11px] text-muted-foreground">Vencidas</p>
                        </div>
                      )}
                    </div>
                    {tasks.length > 0 && (
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.round(tareasHechas.length / tasks.length * 100)}%`, background: "oklch(0.55 0.18 145)" }} />
                      </div>
                    )}
                  </div>
                )}

                {recentLogs.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                    <p className="text-[13px] font-bold text-foreground">Actividad reciente</p>
                    <div className="space-y-2">
                      {recentLogs.map((l, i) => (
                        <div key={i} className="flex gap-3 items-start py-2 border-b border-border/40 last:border-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white mt-0.5"
                            style={{ background: `oklch(0.62 0.18 ${hue})` }}>
                            {(l.autor || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-foreground line-clamp-2">{l.nota}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{l.autor}{l.fecha ? ` · ${new Date(l.fecha?.seconds ? l.fecha.seconds * 1000 : l.fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}` : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {proyAll.length === 0 && tasks.length === 0 && logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-[14px] font-medium text-muted-foreground">Sin actividad registrada aún.</p>
                    <p className="text-[12px] text-muted-foreground mt-1">Agrega actividades, tareas o notas para ver el resumen.</p>
                  </div>
                )}
              </div>
            )
          })()}

          {activeTab === "proyectos" && (<>
            <div className="flex justify-between items-center">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                Actividades <span className="text-[14px] font-normal text-muted-foreground ml-1">({grupo.proyectos?.length || 0})</span>
              </h2>
              {(isAdmin || isMember) && (
                <button onClick={() => { setEditingProject(null); setProjectForm(EMPTY_PROJECT); setPdfImported(false); setPdfError(null); setShowProjectForm(v => !v) }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-90"
                  style={{ background: `oklch(0.62 0.22 ${hue} / 0.12)`, color: `oklch(0.52 0.22 ${hue})` }}>
                  <Plus size={13} /> Proyecto
                </button>
              )}
            </div>
            {showProjectForm && (isAdmin || isMember) && (
              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
                <p className="text-[13px] font-semibold text-foreground">{editingProject ? "Editar actividad" : "Nueva actividad"}</p>
                <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfImport} />
                {!editingProject && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                        style={{ background: "oklch(0.55 0.18 260 / 0.12)", color: "oklch(0.55 0.18 260)" }}>⬆</div>
                      <p className="text-[13px] font-semibold text-foreground">Importar desde PDF de propuesta</p>
                    </div>
                    <div className="rounded-lg p-3 space-y-2" style={{ background: "oklch(0.55 0.18 260 / 0.06)", border: "1px solid oklch(0.55 0.18 260 / 0.15)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "oklch(0.50 0.18 260)" }}>Cómo hacerlo</p>
                      {[
                        { n: "1", text: "Ingresa al Asistente de Propuestas", link: "https://plataforma-investigaciones-vgpt.web.app/dashboard" },
                        { n: "2", text: "Genera el PDF de tu propuesta allí" },
                        { n: "3", text: "Descárgalo y súbelo aquí con el botón de abajo" },
                      ].map(step => (
                        <div key={step.n} className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5"
                            style={{ background: "oklch(0.55 0.18 260)" }}>
                            {step.n}
                          </span>
                          {step.link ? (
                            <a href={step.link} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] font-semibold inline-flex items-center gap-1 transition-opacity hover:opacity-70"
                              style={{ color: "oklch(0.50 0.18 260)" }}>
                              {step.text}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">{step.text}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {pdfError && <p className="text-[11px] text-destructive">{pdfError}</p>}
                    {pdfImported && <p className="text-[11px] font-medium" style={{ color: "oklch(0.55 0.18 145)" }}>✓ Datos importados. Revisa y ajusta si es necesario.</p>}
                    <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}
                      className="w-full text-[12px] font-semibold px-3 py-2 rounded-lg border transition-all disabled:opacity-50"
                      style={{ borderColor: "oklch(0.55 0.18 260 / 0.35)", color: "oklch(0.50 0.18 260)", background: "oklch(0.55 0.18 260 / 0.07)" }}>
                      {pdfLoading ? "Leyendo…" : "⬆ Seleccionar PDF"}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className={labelCls}>Nombre *</p>
                    <input placeholder="Nombre de la actividad" value={projectForm.nombre}
                      onChange={e => setProjectForm(f => ({ ...f, nombre: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Estado</p>
                    <select value={projectForm.estado} onChange={e => setProjectForm(f => ({ ...f, estado: e.target.value }))} className={inputCls}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className={labelCls}>Área</p>
                    <input placeholder="Área o enfoque" value={projectForm.area}
                      onChange={e => setProjectForm(f => ({ ...f, area: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Herramientas (separadas por coma)</p>
                    <input placeholder="React, Firebase, Python…" value={projectForm.herramientas}
                      onChange={e => setProjectForm(f => ({ ...f, herramientas: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Fecha inicio</p>
                    <input type="date" value={projectForm.fechaInicio}
                      onChange={e => setProjectForm(f => ({ ...f, fechaInicio: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Fecha entrega</p>
                    <input type="date" value={projectForm.fechaEntrega}
                      onChange={e => setProjectForm(f => ({ ...f, fechaEntrega: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Qué hace</p>
                    <textarea placeholder="Descripción de la actividad…" value={projectForm.queHace}
                      onChange={e => setProjectForm(f => ({ ...f, queHace: e.target.value }))}
                      rows={2} className={inputCls + " resize-none"} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Avance: {projectForm.avance}%</p>
                    <input type="range" min="0" max="100" step="5" value={projectForm.avance}
                      onChange={e => setProjectForm(f => ({ ...f, avance: e.target.value }))} className="w-full accent-primary" />
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Observaciones</p>
                    <textarea placeholder="Notas adicionales…" value={projectForm.observaciones}
                      onChange={e => setProjectForm(f => ({ ...f, observaciones: e.target.value }))}
                      rows={2} className={inputCls + " resize-none"} />
                  </div>
                </div>
                {editingProject && (() => {
                  const editProjName = editingProject?.nombre || editingProject
                  const proyDocs = groupDocuments.filter(d => d.proyectoNombre === editProjName)
                  const isUploading = uploadingForProject === editProjName && uploadProgress !== null
                  return (
                    <div className="border-t border-border pt-3 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className={labelCls + " mb-0"}>Archivos de la actividad</p>
                        <button type="button"
                          onClick={() => { uploadingProjectRef.current = editProjName; setUploadingForProject(editProjName); fileInputRef.current?.click() }}
                          disabled={uploadProgress !== null}
                          className="text-[11px] font-semibold px-3 py-1 rounded-lg text-white disabled:opacity-50 transition-all hover:opacity-90"
                          style={{ background: `oklch(0.52 0.22 ${hue})` }}>
                          {isUploading ? `${uploadProgress}%` : "↑ Subir archivo"}
                        </button>
                      </div>
                      {isUploading && (
                        <div className="h-1 rounded-full bg-muted overflow-hidden mb-2">
                          <div className="h-full rounded-full transition-all duration-200"
                            style={{ width: `${uploadProgress}%`, background: `oklch(0.52 0.22 ${hue})` }} />
                        </div>
                      )}
                      {uploadingForProject === editProjName && uploadError && (
                        <p className="text-[11px] text-destructive mb-2">{uploadError}</p>
                      )}
                      {proyDocs.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">Sin archivos aún.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {proyDocs.map(d => {
                            const fi = getFileTypeInfo(d.tipo, d.nombre)
                            return (
                              <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/60 bg-background/60">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                                  style={{ color: fi.color, backgroundColor: fi.bg }}>{fi.label}</span>
                                <span className="flex-1 text-[11px] text-foreground truncate">{d.nombre}</span>
                                {d.size && <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatFileSize(d.size)}</span>}
                                <button type="button" onClick={() => downloadFile(d.url, d.nombre)}
                                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Descargar">↓</button>
                                {isAdmin && (
                                  <button type="button" onClick={() => handleDeleteGroupDoc(d)}
                                    className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">×</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveProject} disabled={savingProject}>
                    {savingProject ? "Guardando…" : editingProject ? "Actualizar" : "Crear actividad"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowProjectForm(false); setEditingProject(null) }}>Cancelar</Button>
                </div>
              </div>
            )}
            {(grupo.proyectos?.length || 0) > 3 && (
              <input placeholder="Buscar actividad…" value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)} className={inputCls} />
            )}
            {proyectos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 border border-border/60 rounded-xl">
                <p className="text-[13px] font-medium text-muted-foreground">{grupo.proyectos?.length > 0 ? "Sin coincidencias." : "Sin actividades aún."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {proyectos.map((p, i) => {
                  const stateHue = STATE_COLOR[p.estado] || "260"
                  const av = p.avance ?? 0
                  return (
                    <div key={i} className="border border-border rounded-xl p-4"
                      style={{ borderLeft: `3px solid oklch(0.62 0.18 ${stateHue})` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground text-[14px]">{p.nombre}</span>
                            {p.estado && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `oklch(0.62 0.18 ${stateHue} / 0.13)`, color: `oklch(0.52 0.20 ${stateHue})` }}>
                                {p.estado}
                              </span>
                            )}
                            {p.area && (
                              <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{p.area}</span>
                            )}
                          </div>
                        </div>
                        {(isAdmin || isMember) && (
                          <div className="flex gap-2 flex-shrink-0 items-center">
                            {isAdmin && (
                              <button onClick={() => handleReturnProject(p)} title="Devolver al perfil individual"
                                className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
                                style={{ color: "oklch(0.55 0.16 145)", background: "oklch(0.55 0.16 145 / 0.10)" }}>
                                ← Individual
                              </button>
                            )}
                            <button onClick={() => openEditProject(p)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil size={13} />
                            </button>
                            {isAdmin && (
                              <button onClick={() => handleDeleteProject(p)} className="text-destructive/60 hover:text-destructive transition-colors">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-muted-foreground">Avance</span>
                          <span style={{ color: avanceColor(av) }} className="font-semibold">{av}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.40 0.02 260 / 0.3)" }}>
                          <div className="h-full rounded-full" style={{ width: `${av}%`, background: avanceColor(av) }} />
                        </div>
                      </div>
                      {p.queHace && <p className="text-[12.5px] text-muted-foreground mb-2 leading-relaxed">{p.queHace}</p>}
                      {p.herramientas?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {p.herramientas.map(h => (
                            <span key={h} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{h}</span>
                          ))}
                        </div>
                      )}
                      {(p.fechaInicio || p.fechaEntrega) && (
                        <div className="flex gap-4 text-[11px] text-muted-foreground">
                          {p.fechaInicio && <span>Inicio: <strong>{p.fechaInicio}</strong></span>}
                          {p.fechaEntrega && <span>Entrega: <strong>{p.fechaEntrega}</strong></span>}
                        </div>
                      )}
                      {p.observaciones && <p className="text-[12px] text-muted-foreground mt-2 italic">{p.observaciones}</p>}
                      {canAccess && (() => {
                        const proyDocs = groupDocuments.filter(d => d.proyectoNombre === p.nombre)
                        const isOpen = openDocProjects.has(p.nombre)
                        const isUploading = uploadingForProject === p.nombre && uploadProgress !== null
                        return (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => setOpenDocProjects(prev => { const s = new Set(prev); s.has(p.nombre) ? s.delete(p.nombre) : s.add(p.nombre); return s })}
                                className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                                <span>Archivos</span>
                                {proyDocs.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ backgroundColor: `oklch(0.62 0.18 ${hue} / 0.15)`, color: `oklch(0.52 0.20 ${hue})` }}>
                                    {proyDocs.length}
                                  </span>
                                )}
                                <span className="text-[10px] opacity-50">{isOpen ? "▲" : "▼"}</span>
                              </button>
                              <button
                                onClick={() => { uploadingProjectRef.current = p.nombre; setUploadingForProject(p.nombre); fileInputRef.current?.click() }}
                                disabled={uploadProgress !== null}
                                className="text-[11px] font-semibold px-3 py-1 rounded-lg text-white disabled:opacity-50 transition-all hover:opacity-90"
                                style={{ background: `oklch(0.52 0.22 ${hue})` }}>
                                {isUploading ? `${uploadProgress}%` : "↑ Subir"}
                              </button>
                            </div>
                            {isUploading && (
                              <div className="h-1 rounded-full bg-muted overflow-hidden mt-2">
                                <div className="h-full rounded-full transition-all duration-200"
                                  style={{ width: `${uploadProgress}%`, background: `oklch(0.52 0.22 ${hue})` }} />
                              </div>
                            )}
                            {uploadingForProject === p.nombre && uploadError && (
                              <p className="text-[11px] text-destructive mt-1">{uploadError}</p>
                            )}
                            {isOpen && (
                              <div className="mt-2 space-y-1.5">
                                {proyDocs.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground italic">Sin archivos aún.</p>
                                ) : proyDocs.map(d => {
                                  const fi = getFileTypeInfo(d.tipo, d.nombre)
                                  return (
                                    <div key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/60 bg-muted/30">
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                                        style={{ color: fi.color, backgroundColor: fi.bg }}>{fi.label}</span>
                                      <span className="flex-1 text-[11px] text-foreground truncate">{d.nombre}</span>
                                      {d.size && <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatFileSize(d.size)}</span>}
                                      <button type="button" onClick={() => downloadFile(d.url, d.nombre)}
                                        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Descargar">↓</button>
                                      {isAdmin && (
                                        <button onClick={() => handleDeleteGroupDoc(d)}
                                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">×</button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )}
          </>)}

          {activeTab === "bitacora" && (<>
            <div className="flex justify-between items-center">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                Bitácora <span className="text-[14px] font-normal text-muted-foreground ml-1">({logs.length})</span>
              </h2>
            </div>
            {canLog && (
              <div className="relative">
                <textarea ref={notaRef} placeholder="Escribe una nota del grupo…" value={nota}
                  onChange={e => setNota(e.target.value)} rows={3} className={inputCls + " resize-none pr-10"} />
                <button className="absolute right-3 bottom-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEmoji(v => !v)}>😊</button>
                {showEmoji && (
                  <div className="absolute right-0 top-full mt-1 z-50">
                    <EmojiPicker onEmojiClick={e => { setNota(n => n + e.emoji); setShowEmoji(false); notaRef.current?.focus() }} height={350} width={300} />
                  </div>
                )}
                <input ref={logAttachRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" className="hidden"
                  onChange={e => { Array.from(e.target.files||[]).forEach(f => handleGrupoAttach(f, `logs-grupo/${id}`, meta => setLogAttachFiles(p => [...p, meta]), setLogAttachUploading)); e.target.value="" }} />
                {logAttachFiles.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {logAttachFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] px-2 py-1 rounded-lg border border-border bg-muted/40">
                        <span className="flex-1 truncate">{f.nombre}</span>
                        <button type="button" onClick={() => setLogAttachFiles(p => p.filter((_,j)=>j!==i))} className="text-destructive hover:opacity-70">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={() => logAttachRef.current?.click()} disabled={logAttachUploading}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                    📎 {logAttachUploading ? "Subiendo…" : "Adjuntar archivo"}
                  </button>
                  <Button size="sm" onClick={handleAddLog} disabled={savingLog || !nota.trim() || logAttachUploading}>
                    {savingLog ? "Guardando…" : "Agregar nota"}
                  </Button>
                </div>
              </div>
            )}
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 border border-border/60 rounded-xl">
                <p className="text-[13px] font-medium text-muted-foreground">Sin notas aún.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(l => {
                  const canEditLog = isAdmin || l.creadoPor === user?.uid
                  return (
                    <div key={l.id} className="border border-border/60 rounded-xl p-4">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          {editingLogId === l.id ? (
                            <div className="space-y-2">
                              <textarea value={editingLogText} onChange={e => setEditingLogText(e.target.value)}
                                rows={3} className={inputCls + " resize-none"} />
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveEditLog(l.id)}
                                  className="text-[12px] text-primary flex items-center gap-1 hover:opacity-80"><Check size={12} /> Guardar</button>
                                <button onClick={() => setEditingLogId(null)}
                                  className="text-[12px] text-muted-foreground flex items-center gap-1 hover:text-foreground"><X size={12} /> Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{l.nota}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[11px] text-muted-foreground font-medium">{l.creadoPorNombre}</span>
                            {l.createdAt?.toDate && (
                              <span className="text-[11px] text-muted-foreground capitalize">
                                · {format(l.createdAt.toDate(), "d 'de' MMM 'a las' HH:mm", { locale: es })}
                              </span>
                            )}
                          </div>
                        </div>
                        {canEditLog && editingLogId !== l.id && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={() => { setEditingLogId(l.id); setEditingLogText(l.nota) }}
                              className="text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                            <button onClick={() => handleDeleteLog(l.id)}
                              className="text-destructive/60 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>)}

          {activeTab === "tareas" && (<>
            <div className="flex justify-between items-center">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                Tareas
                {tareasPendientes.length > 0 && (
                  <span className="ml-2 text-[12px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "oklch(0.62 0.22 27 / 0.15)", color: "oklch(0.52 0.22 27)" }}>
                    {tareasPendientes.length} pendiente{tareasPendientes.length !== 1 ? "s" : ""}
                  </span>
                )}
              </h2>
              {isAdmin && (
                <button onClick={() => setShowTaskForm(v => !v)}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-90"
                  style={{ background: `oklch(0.62 0.22 ${hue} / 0.12)`, color: `oklch(0.52 0.22 ${hue})` }}>
                  <Plus size={13} /> Tarea
                </button>
              )}
            </div>
            {showTaskForm && isAdmin && (
              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Título *</p>
                    <input placeholder="Título de la tarea" value={taskForm.titulo}
                      onChange={e => setTaskForm(f => ({ ...f, titulo: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Descripción</p>
                    <input placeholder="Descripción (opcional)" value={taskForm.descripcion}
                      onChange={e => setTaskForm(f => ({ ...f, descripcion: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Fecha inicio</p>
                    <input type="date" value={taskForm.fechaInicio}
                      onChange={e => setTaskForm(f => ({ ...f, fechaInicio: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <p className={labelCls}>Fecha límite</p>
                    <input type="date" value={taskForm.fechaLimite}
                      onChange={e => setTaskForm(f => ({ ...f, fechaLimite: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Avance inicial: {taskForm.avance}%</p>
                    <input type="range" min="0" max="100" step="5" value={taskForm.avance}
                      onChange={e => setTaskForm(f => ({ ...f, avance: Number(e.target.value) }))} className="w-full accent-primary" />
                  </div>
                </div>
                <input ref={newTaskAttachRef} type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" className="hidden"
                  onChange={e => { Array.from(e.target.files||[]).forEach(f => handleGrupoAttach(f, `tareas-grupo/${id}/nueva`, meta => setNewTaskAttachFiles(p => [...p, meta]), setNewTaskAttachUploading)); e.target.value="" }} />
                {newTaskAttachFiles.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {newTaskAttachFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] px-2 py-1 rounded-lg border border-border bg-muted/40">
                        <span className="flex-1 truncate">{f.nombre}</span>
                        <button type="button" onClick={() => setNewTaskAttachFiles(p => p.filter((_,j)=>j!==i))} className="text-destructive hover:opacity-70">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => newTaskAttachRef.current?.click()} disabled={newTaskAttachUploading}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                    📎 {newTaskAttachUploading ? "Subiendo…" : "Adjuntar archivo"}
                  </button>
                  <Button size="sm" onClick={handleAddTask} disabled={savingTask || newTaskAttachUploading}>
                    {savingTask ? "Guardando…" : "Crear tarea"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowTaskForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 border border-border/60 rounded-xl">
                <p className="text-[13px] font-medium text-muted-foreground">Sin tareas aún.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...tareasPendientes, ...tareasHechas].map(t => {
                  const done = t.estado === "Hecho"
                  return (
                    <div key={t.id} className="p-3 rounded-xl border border-border/60 group">
                      {editingTaskId === t.id ? (
                        <div className="space-y-3">
                          <input value={editingTaskForm.titulo}
                            onChange={e => setEditingTaskForm(f => ({ ...f, titulo: e.target.value }))}
                            placeholder="Título *" className={inputCls} />
                          <input value={editingTaskForm.descripcion}
                            onChange={e => setEditingTaskForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Descripción (opcional)" className={inputCls} />
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <p className={labelCls}>Fecha inicio</p>
                              <input type="date" value={editingTaskForm.fechaInicio || ""}
                                onChange={e => setEditingTaskForm(f => ({ ...f, fechaInicio: e.target.value }))} className={inputCls} />
                            </div>
                            <div className="flex-1">
                              <p className={labelCls}>Fecha límite</p>
                              <input type="date" value={editingTaskForm.fechaLimite || ""}
                                onChange={e => setEditingTaskForm(f => ({ ...f, fechaLimite: e.target.value }))} className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <p className={labelCls}>Avance: {editingTaskForm.avance ?? 0}%</p>
                            <input type="range" min="0" max="100" step="5" value={editingTaskForm.avance ?? 0}
                              onChange={e => setEditingTaskForm(f => ({ ...f, avance: Number(e.target.value) }))} className="w-full accent-primary" />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEditTask(t)}>Guardar</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingTaskId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <button onClick={() => handleTaskStatus(t.id, done ? "Pendiente" : "Hecho")}
                            className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
                            style={{ borderColor: done ? "oklch(0.55 0.18 145)" : "var(--border)", backgroundColor: done ? "oklch(0.55 0.18 145)" : "transparent" }}>
                            {done && <Check size={10} className="text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium leading-tight ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {t.titulo}
                            </p>
                            {t.descripcion && <p className="text-[11px] text-muted-foreground mt-0.5">{t.descripcion}</p>}
                            {isMember && !isAdmin && !done ? (
                              <div className="mt-1.5">
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-muted-foreground font-medium">Avance</span>
                                  <span className="font-bold tabular-nums" style={{ color: (taskAvanceLocal[t.id] ?? t.avance ?? 0) >= 100 ? "oklch(0.55 0.18 145)" : (taskAvanceLocal[t.id] ?? t.avance ?? 0) >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)" }}>
                                    {taskAvanceLocal[t.id] ?? t.avance ?? 0}%
                                  </span>
                                </div>
                                <input type="range" min="0" max="100" step="5"
                                  value={taskAvanceLocal[t.id] ?? t.avance ?? 0}
                                  onChange={e => setTaskAvanceLocal(prev => ({ ...prev, [t.id]: Number(e.target.value) }))}
                                  disabled={savingAvance === t.id} className="w-full accent-primary disabled:opacity-50" />
                                {taskAvanceLocal[t.id] != null && taskAvanceLocal[t.id] !== (t.avance ?? 0) && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <button onClick={() => handleUpdateAvance(t.id, taskAvanceLocal[t.id])}
                                      disabled={savingAvance === t.id}
                                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
                                      style={{ background: `oklch(0.52 0.22 ${hue})` }}>
                                      {savingAvance === t.id ? "Guardando…" : "Guardar avance"}
                                    </button>
                                    <button onClick={() => setTaskAvanceLocal(prev => { const n = { ...prev }; delete n[t.id]; return n })}
                                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                      Descartar
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (t.avance != null && t.avance > 0) && (
                              <div className="mt-1.5">
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-muted-foreground">Avance</span>
                                  <span className="font-semibold" style={{ color: t.avance >= 100 ? "oklch(0.55 0.18 145)" : t.avance >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)" }}>
                                    {t.avance}%
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                                  <div className="h-full rounded-full" style={{ width: `${t.avance}%`, background: t.avance >= 100 ? "oklch(0.55 0.18 145)" : t.avance >= 50 ? "oklch(0.55 0.18 260)" : "oklch(0.60 0.18 55)" }} />
                                </div>
                              </div>
                            )}
                            <div className="flex gap-3 mt-0.5 flex-wrap">
                              {t.fechaInicio && <p className="text-[11px] text-muted-foreground">Inicio: {t.fechaInicio}</p>}
                              {t.fechaLimite && <p className="text-[11px] text-muted-foreground">Límite: {t.fechaLimite}</p>}
                            </div>
                            {t.solicitudPlazo && isAdmin && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.68 0.18 55 / 0.10)", border: "1px solid oklch(0.68 0.18 55 / 0.30)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.58 0.20 55)" }}>
                                  ⏰ Solicitud · {t.solicitudPlazo.solicitadoPor}
                                </p>
                                <p className="text-[12px] text-foreground mt-0.5">{t.solicitudPlazo.motivo}</p>
                                {t.solicitudPlazo.fechaPropuesta && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Propuesta: {format(new Date(t.solicitudPlazo.fechaPropuesta + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                  </p>
                                )}
                                {aceptandoPlazoId === t.id ? (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <input type="date" value={fechaAceptar} onChange={e => setFechaAceptar(e.target.value)}
                                      className="bg-background border border-border rounded-lg px-2 py-1 text-[11px] text-foreground focus:outline-none" />
                                    <button onClick={() => handleAceptarPlazo(t)} disabled={!fechaAceptar || savingPlazo}
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
                                    <button onClick={() => handleAceptarPlazo(t)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.55 0.18 145)" }}>
                                      {savingPlazo ? "…" : "✓ Aceptar"}
                                    </button>
                                    <button onClick={() => handleRechazarPlazo(t.id)} disabled={savingPlazo}
                                      className="h-6 px-2 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.50 0.22 25)" }}>
                                      {savingPlazo ? "…" : "✗ Rechazar"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {t.solicitudPlazo && isMember && editandoSolicitudId !== t.id && (
                              <div className="mt-1.5 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.68 0.18 55 / 0.10)", border: "1px solid oklch(0.68 0.18 55 / 0.30)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.58 0.20 55)" }}>⏰ Solicitud enviada</p>
                                <p className="text-[12px] text-foreground mt-0.5">{t.solicitudPlazo.motivo}</p>
                                <button onClick={() => { setEditandoSolicitudId(t.id); setSolicitudMotivo(t.solicitudPlazo.motivo || ""); setSolicitudFecha(t.solicitudPlazo.fechaPropuesta || ""); setSolicitudPlazoId(t.id) }}
                                  className="text-[11px] font-medium mt-1 hover:opacity-70 transition-opacity" style={{ color: "oklch(0.58 0.20 55)" }}>
                                  ✏ Editar solicitud
                                </button>
                              </div>
                            )}
                            {t.plazoAceptado && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.62 0.20 145 / 0.12)", border: "1px solid oklch(0.62 0.20 145 / 0.35)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.20 145)" }}>✓ Plazo aceptado</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Nueva fecha: {format(new Date(t.plazoAceptado.nuevaFecha + "T00:00:00"), "d 'de' MMMM, yyyy", { locale: es })}
                                </p>
                              </div>
                            )}
                            {t.plazoRechazado && (
                              <div className="mt-2 px-3 py-2 rounded-lg"
                                style={{ background: "oklch(0.62 0.22 25 / 0.12)", border: "1px solid oklch(0.62 0.22 25 / 0.35)" }}>
                                <p className="text-[11px] font-bold" style={{ color: "oklch(0.62 0.22 25)" }}>✗ Plazo rechazado</p>
                              </div>
                            )}
                            {canAccess && (
                              <div className="mt-2 pt-2 border-t border-border">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => setOpenTaskFiles(prev => { const s = new Set(prev); s.has(t.id) ? s.delete(t.id) : s.add(t.id); return s })}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                                    <span>Archivos</span>
                                    {(t.archivos?.length > 0) && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ background: `oklch(0.62 0.22 ${hue} / 0.15)`, color: `oklch(0.52 0.22 ${hue})` }}>
                                        {t.archivos.length}
                                      </span>
                                    )}
                                    <span className="text-[9px] opacity-40">{openTaskFiles.has(t.id) ? "▲" : "▼"}</span>
                                  </button>
                                  <button
                                    onClick={() => { uploadingTaskIdRef.current = t.id; taskFileInputRef.current?.click() }}
                                    disabled={taskFileProgress !== null}
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                                    style={{ background: `oklch(0.52 0.22 ${hue})` }}>
                                    {taskFileProgress?.taskId === t.id ? `${taskFileProgress.progress}%` : "↑ Subir"}
                                  </button>
                                </div>
                                {taskFileProgress?.taskId === t.id && (
                                  <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5">
                                    <div className="h-full rounded-full transition-all"
                                      style={{ width: `${taskFileProgress.progress}%`, background: `oklch(0.52 0.22 ${hue})` }} />
                                  </div>
                                )}
                                {openTaskFiles.has(t.id) && (
                                  <div className="mt-1.5 space-y-1">
                                    {!t.archivos?.length ? (
                                      <p className="text-[10px] text-muted-foreground italic py-1">Sin archivos adjuntos.</p>
                                    ) : t.archivos.map((arch, ai) => {
                                      const fi = getFileTypeInfo(arch.tipo, arch.nombre)
                                      return (
                                        <div key={ai} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40">
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                                            style={{ background: fi.bg, color: fi.color }}>{fi.label}</span>
                                          <span className="text-[11px] text-foreground truncate flex-1 min-w-0">{arch.nombre}</span>
                                          {arch.size && <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatFileSize(arch.size)}</span>}
                                          <button type="button" onClick={() => downloadFile(arch.url, arch.nombre)}
                                            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Descargar">↓</button>
                                          {(isAdmin || isMember) && (
                                            <button onClick={() => handleDeleteGroupTaskFile(t.id, arch)}
                                              className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">×</button>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {isMember && !done && !t.plazoAceptado && !t.plazoRechazado && (!t.solicitudPlazo || editandoSolicitudId === t.id) && (
                              solicitudPlazoId === t.id ? (
                                <div className="mt-2 space-y-2">
                                  <textarea value={solicitudMotivo} onChange={e => setSolicitudMotivo(e.target.value)}
                                    placeholder="¿Por qué necesitas más tiempo?" rows={2}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none" />
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <input type="date" value={solicitudFecha} onChange={e => setSolicitudFecha(e.target.value)}
                                      className="bg-muted/50 border border-border rounded-xl px-3 py-1.5 text-[12px] text-foreground focus:outline-none" />
                                    <span className="text-[11px] text-muted-foreground">fecha propuesta (opcional)</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => { handleSolicitarPlazo(t.id); setEditandoSolicitudId(null) }}
                                      disabled={savingSolicitud || !solicitudMotivo.trim()}
                                      className="h-7 px-3 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                                      style={{ background: "oklch(0.58 0.20 55)" }}>
                                      {savingSolicitud ? "Enviando…" : "Enviar solicitud"}
                                    </button>
                                    <button onClick={() => { setSolicitudPlazoId(null); setSolicitudMotivo(""); setSolicitudFecha(""); setEditandoSolicitudId(null) }}
                                      className="h-7 px-3 rounded-lg text-[11px] border border-border text-muted-foreground hover:text-foreground">
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => { setSolicitudPlazoId(t.id); setSolicitudMotivo(""); setSolicitudFecha("") }}
                                  className="mt-1.5 text-[11px] font-medium hover:opacity-70 transition-opacity"
                                  style={{ color: "oklch(0.58 0.20 55)" }}>
                                  ⏳ Solicitar más tiempo
                                </button>
                              )
                            )}
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingTaskId(t.id); setEditingTaskForm({ titulo: t.titulo, descripcion: t.descripcion || "", fechaInicio: t.fechaInicio || "", fechaLimite: t.fechaLimite || "", avance: t.avance ?? 0 }) }}
                                className="text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                              <button onClick={() => handleDeleteTask(t.id)}
                                className="text-destructive/60 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>)}

          {activeTab === "feedback" && (<>
            <div className="flex justify-between items-center">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                Retroalimentación <span className="text-[14px] font-normal text-muted-foreground ml-1">({feedback.length})</span>
              </h2>
            </div>
            {isAdmin && (
              <div>
                <textarea placeholder="Escribe retroalimentación para el grupo…"
                  value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  rows={3} className={inputCls + " resize-none"} />
                <Button size="sm" className="mt-2" onClick={handleAddFeedback} disabled={savingFeedback || !feedbackText.trim()}>
                  {savingFeedback ? "Guardando…" : "Enviar"}
                </Button>
              </div>
            )}
            {feedback.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 border border-border/60 rounded-xl">
                <p className="text-[13px] font-medium text-muted-foreground">Sin retroalimentación aún.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedback.map(f => (
                  <div key={f.id} className="border border-border/60 rounded-xl p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        {editingFbId === f.id ? (
                          <div className="space-y-2">
                            <textarea value={editingFbText} onChange={e => setEditingFbText(e.target.value)}
                              rows={3} className={inputCls + " resize-none"} />
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveEditFeedback(f.id)}
                                className="text-[12px] text-primary flex items-center gap-1"><Check size={12} /> Guardar</button>
                              <button onClick={() => setEditingFbId(null)}
                                className="text-[12px] text-muted-foreground flex items-center gap-1"><X size={12} /> Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{f.texto}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">{f.creadoPorNombre}</span>
                          {f.createdAt?.toDate && (
                            <span className="text-[11px] text-muted-foreground capitalize">
                              · {format(f.createdAt.toDate(), "d 'de' MMM 'a las' HH:mm", { locale: es })}
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && editingFbId !== f.id && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => { setEditingFbId(f.id); setEditingFbText(f.texto) }}
                            className="text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => handleDeleteFeedback(f.id)}
                            className="text-destructive/60 hover:text-destructive transition-colors"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {activeTab === "participantes" && isAdmin && (<>
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-foreground tracking-tight">
                Participantes
                {contacts.length > 0 && (
                  <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "oklch(0.60 0.18 260 / 0.12)", color: "oklch(0.55 0.18 260)" }}>
                    {contacts.length}
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                {contacts.length > 0 && (
                  <button onClick={handleDeleteAllContacts}
                    className="text-[11px] font-semibold text-destructive/70 hover:text-destructive transition-colors">
                    Limpiar todo
                  </button>
                )}
                <button onClick={() => contactsInputRef.current?.click()} disabled={importLoading}
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-xl border border-border text-foreground hover:border-primary/40 hover:bg-muted/60 disabled:opacity-50 transition-all">
                  {importLoading ? "Leyendo…" : "↑ Importar Excel / CSV"}
                </button>
              </div>
            </div>
            {importError && <p className="text-[12px] text-destructive">{importError}</p>}
            {importPreview && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-foreground">
                    Se importarán <span style={{ color: "oklch(0.55 0.18 145)" }}>{importPreview.length} contactos</span>
                  </p>
                  <button onClick={() => setImportPreview(null)} className="text-[11px] text-muted-foreground hover:text-foreground">✕ Cancelar</button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Nombre</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Teléfono</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Correo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 5).map((c, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2 text-foreground">{c.nombre || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.telefono || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.correo || "—"}</td>
                        </tr>
                      ))}
                      {importPreview.length > 5 && (
                        <tr><td colSpan={3} className="px-3 py-2 text-muted-foreground italic text-center">…y {importPreview.length - 5} más</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <button onClick={handleConfirmImport} disabled={importSaving}
                  className="text-[13px] font-bold px-5 py-2 rounded-xl text-white disabled:opacity-50 transition-all hover:opacity-90"
                  style={{ background: "oklch(0.55 0.18 145)" }}>
                  {importSaving ? "Guardando…" : `Confirmar importación (${importPreview.length})`}
                </button>
              </div>
            )}
            {contacts.length > 0 && (
              <>
                <input type="text" placeholder="Buscar participante…" value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  className="w-full h-9 bg-card border border-border rounded-xl pl-4 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all" />
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-card">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Nombre</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Teléfono</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Correo</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {contacts
                        .filter(c => {
                          const q = contactSearch.toLowerCase()
                          return !q || c.nombre?.toLowerCase().includes(q) || c.correo?.toLowerCase().includes(q) || c.telefono?.includes(q)
                        })
                        .map(c => (
                          <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors group">
                            <td className="px-4 py-2.5 font-medium text-foreground">{c.nombre || "—"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{c.telefono || "—"}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{c.correo || "—"}</td>
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => handleDeleteContact(c.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">✕</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {contacts.length === 0 && !importPreview && (
              <div className="text-center py-10 text-muted-foreground bg-card border border-border rounded-2xl">
                <p className="text-[13px]">Sin participantes importados. Sube un Excel o CSV con columnas: Nombre, Teléfono, Correo.</p>
              </div>
            )}
          </>)}

        </main>
        <Footer />
      </div>

      {returningProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 0.55)", backdropFilter: "blur(4px)" }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-[15px] font-bold text-foreground mb-1">Devolver al perfil individual</h3>
            <p className="text-[12px] text-muted-foreground mb-4">
              Selecciona a qué compañera pertenece el proyecto <strong>"{returningProject.nombre}"</strong>.
            </p>
            <select
              value={returnTargetId || miembros[0]?.id || ""}
              onChange={e => setReturnTargetId(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 mb-4">
              {miembros.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleConfirmReturn} disabled={savingReturn || !returnTargetId}
                className="flex-1 py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "oklch(0.55 0.18 145)" }}>
                {savingReturn ? "Devolviendo…" : "Confirmar"}
              </button>
              <button onClick={() => setReturningProject(null)}
                className="flex-1 py-2 rounded-xl text-[13px] border border-border text-muted-foreground hover:text-foreground transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={contactsInputRef} type="file" accept=".csv,.xls,.xlsx"
        style={{ display: "none" }} onChange={handleContactsFileSelected} />
      <input ref={fileInputRef} type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
        style={{ display: "none" }} onChange={handleFileSelected} />
      <input ref={taskFileInputRef} type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        style={{ display: "none" }} onChange={handleGroupTaskFileSelected} />
    </div>
  )
}
