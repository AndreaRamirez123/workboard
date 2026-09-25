import { useState, useEffect, useRef } from "react"
import { downloadFile } from "@/utils/download"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from "firebase/firestore"
import { db } from "@/services/firebase"
import { updateProject } from "@/services/colleagues.service"
import { uploadDocument, getDocuments, deleteDocument, MAX_FILE_SIZE } from "@/services/storage.service"
import { useAuth } from "@/context/AuthContext"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { Footer } from "@/components/ui/Footer"
import { extractPdfText, parseCunPdf } from "@/utils/parsePropuesta"

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

const AREAS = [
  "Desarrollo de Software", "Robótica", "Inteligencia Artificial",
  "Infraestructura / DevOps", "Diseño UX/UI", "Investigación", "Soporte Técnico",
]
const PROJECT_STATES = ["Formulación", "En ejecución", "En evaluación", "Finalizado", "Suspendido"]
const VERSION_STATES = ["Pendiente", "En curso", "Entregado", "Cancelado"]

export default function ProjectForm() {
  const { id, semilleroId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const editData = location.state?.editProject
  const isEdit = Boolean(editData)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [pdfImported, setPdfImported] = useState(false)

  // Documentos
  const fileInputRef = useRef(null)
  const pdfInputRef = useRef(null)
  const [documents, setDocuments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [form, setForm] = useState({
    nombre: editData?.nombre || "",
    estado: editData?.estado || "",
    avance: editData?.avance ?? 0,
    area: editData?.area || "",
    queHace: editData?.queHace || "",
    herramientas: (editData?.herramientas || []).join(", "),
    observaciones: editData?.observaciones || "",
    fechaInicio: editData?.fechaInicio || "",
    fechaEntrega: editData?.fechaEntrega || "",
    versiones: editData?.versiones || [],
  })

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

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
        setPdfError("No se reconoció el formato de la propuesta. Verifica que sea un PDF del Asistente CUN.")
        return
      }
      setForm(prev => ({
        ...prev,
        ...(fields.nombre       && { nombre: fields.nombre }),
        ...(fields.area         && { area: fields.area }),
        ...(fields.queHace      && { queHace: fields.queHace }),
        ...(fields.herramientas && { herramientas: fields.herramientas }),
        ...(fields.observaciones && { observaciones: fields.observaciones }),
        ...(fields.fechaInicio  && { fechaInicio: fields.fechaInicio }),
        ...(fields.fechaEntrega && { fechaEntrega: fields.fechaEntrega }),
        ...(fields.versiones?.length && { versiones: fields.versiones }),
      }))
      setPdfImported(true)
    } catch (err) {
      console.error("[Workboard] Error parseando PDF:", err)
      setPdfError("No se pudo leer el archivo. Asegúrate de que sea un PDF válido.")
    } finally {
      setPdfLoading(false)
    }
  }

  const addVersion = () => setForm(f => ({ ...f, versiones: [...f.versiones, { nombre: "", fecha: "", estado: "" }] }))
  const removeVersion = (i) => setForm(f => ({ ...f, versiones: f.versiones.filter((_, idx) => idx !== i) }))
  const updateVersion = (i, key, value) => {
    const updated = [...form.versiones]
    updated[i] = { ...updated[i], [key]: value }
    setForm(f => ({ ...f, versiones: updated }))
  }

  // Carga documentos del proyecto al entrar en modo edición
  useEffect(() => {
    if (isEdit && id && editData?.nombre) {
      getDocuments(id).then(all =>
        setDocuments(all.filter(d => d.proyectoNombre === editData.nombre))
      )
    }
  }, [isEdit, id, editData?.nombre])

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const proyName = form.nombre.trim()
    if (!proyName) return
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("El archivo supera el límite de 15 MB.")
      return
    }
    setUploadError(null)
    setUploadProgress(0)
    try {
      const doc = await uploadDocument(id, file, {
        onProgress: setUploadProgress,
        uploadedBy: user?.uid,
        uploadedByName: user?.displayName || user?.email,
        proyectoNombre: proyName,
      })
      setDocuments(prev => [doc, ...prev])
    } catch (err) {
      console.error("[Workboard] Error subiendo archivo:", err)
      setUploadError("No se pudo subir el archivo. Intenta de nuevo.")
    } finally {
      setUploadProgress(null)
    }
  }

  const handleDeleteDoc = async (d) => {
    if (!window.confirm(`¿Eliminar "${d.nombre}"?`)) return
    try {
      await deleteDocument(id, d.id, d.storagePath)
      setDocuments(prev => prev.filter(x => x.id !== d.id))
    } catch (err) {
      console.error("[Workboard] Error eliminando documento:", err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setSaving(true)
    setSaveError(null)
    const proyecto = {
      nombre: form.nombre.trim(),
      estado: form.estado,
      avance: 0,
      area: form.area.trim(),
      queHace: form.queHace.trim(),
      herramientas: form.herramientas.split(",").map(h => h.trim()).filter(Boolean),
      observaciones: form.observaciones.trim(),
      fechaInicio: form.fechaInicio,
      fechaEntrega: form.fechaEntrega,
      versiones: form.versiones.filter(v => v.nombre.trim()),
    }
    try {
      if (isEdit) {
        await updateProject(id, editData, proyecto)
      } else {
        await updateDoc(doc(db, "companeros", id), { proyectos: arrayUnion(proyecto) })
        // Notificar al coordinador de equipo sobre el nuevo proyecto
        addDoc(collection(db, "logs"), {
          colleagueId: id,
          colleagueName: user?.displayName || user?.email || "Alguien",
          semilleroId,
          tipo: "proyecto_agregado",
          nota: proyecto.nombre,
          creadoPor: user?.uid || null,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }
      navigate(`/semillero/${semilleroId}/colleague/${id}`)
    } catch (err) {
      console.error("[Workboard] Error guardando proyecto:", err.code, err.message)
      setSaveError("No se pudo guardar. Verifica los permisos o intenta de nuevo.")
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/30 transition-all"
  const selectClass = "bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer transition-all"
  const sectionLabel = "text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4 block"

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 px-6 py-3 flex justify-between items-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--background) 85%, transparent)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate(`/semillero/${semilleroId}/colleague/${id}`)}
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Volver
        </button>
        <ThemeToggle />
      </header>

      {/* ── Hero strip ── */}
      <div className="relative overflow-hidden px-6 py-8"
        style={{ background: "linear-gradient(125deg, oklch(0.46 0.13 165) 0%, oklch(0.40 0.14 185) 45%, oklch(0.48 0.14 245) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-56 h-56 opacity-25"
            style={{ background: "radial-gradient(circle at top right, oklch(0.58 0.16 295), transparent 65%)", filter: "blur(40px)" }} />
        </div>
        <div className="relative flex items-center gap-5 px-6">
          <div className="w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.62 0.18 165), oklch(0.54 0.22 205))", boxShadow: "0 8px 24px oklch(0.52 0.13 165 / 40%)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
              {isEdit ? "Editar actividad" : "Nueva actividad"}
            </h1>
            <p className="text-[13px] text-white/70 mt-0.5">
              {isEdit ? form.nombre || "Actualiza los datos de la actividad" : "Define el alcance y cronograma"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="rounded-2xl border border-border p-5 space-y-4" style={{ background: "var(--muted)" }}>

        {/* ── Importar desde PDF ── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: "oklch(0.55 0.18 260 / 0.12)", color: "oklch(0.55 0.18 260)" }}>
              ⬆
            </div>
            <p className="text-[14px] font-semibold text-foreground">Importar desde PDF de propuesta</p>
          </div>

          {/* Pasos */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: "oklch(0.55 0.18 260 / 0.06)", border: "1px solid oklch(0.55 0.18 260 / 0.15)" }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "oklch(0.50 0.18 260)" }}>Cómo hacerlo</p>
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
                    className="text-[12px] font-semibold inline-flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ color: "oklch(0.50 0.18 260)" }}>
                    {step.text}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                ) : (
                  <span className="text-[12px] text-muted-foreground">{step.text}</span>
                )}
              </div>
            ))}
          </div>

          {pdfError && (
            <p className="text-[12px] text-destructive">{pdfError}</p>
          )}
          {pdfImported && (
            <p className="text-[12px] font-medium" style={{ color: "oklch(0.55 0.18 145)" }}>
              ✓ Datos importados correctamente. Revisa y ajusta si es necesario.
            </p>
          )}

          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfLoading}
            className="w-full text-[13px] font-semibold px-4 py-2.5 rounded-xl border transition-all disabled:opacity-50"
            style={{ borderColor: "oklch(0.55 0.18 260 / 0.35)", color: "oklch(0.50 0.18 260)", background: "oklch(0.55 0.18 260 / 0.07)" }}
          >
            {pdfLoading ? "Leyendo…" : "⬆ Seleccionar PDF"}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Campos del proyecto ── */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nombre *</label>
                <input name="nombre" value={form.nombre} onChange={handleChange}
                  placeholder="Ej: Portal de pagos" className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} className={inputClass}>
                  <option value="">Sin estado</option>
                  {PROJECT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Enfoque</label>
                <input list="areas-list-p" name="area" value={form.area} onChange={handleChange}
                  placeholder="Ej: Robótica, Diseño UX/UI…" className={inputClass} autoComplete="off" />
                <datalist id="areas-list-p">
                  {AREAS.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Herramientas (separadas por coma)</label>
                <input name="herramientas" value={form.herramientas} onChange={handleChange}
                  placeholder="Ej: React, Firebase, Python…" className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Fecha de inicio</label>
                <input type="date" name="fechaInicio" value={form.fechaInicio} onChange={handleChange}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Entrega final</label>
                <input type="date" name="fechaEntrega" value={form.fechaEntrega} onChange={handleChange}
                  className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">¿Qué hace en esta actividad?</label>
                <textarea name="queHace" value={form.queHace} onChange={handleChange}
                  placeholder="Ej: Desarrolla el módulo de facturación…" rows={3} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Observaciones</label>
                <textarea name="observaciones" value={form.observaciones} onChange={handleChange}
                  placeholder="Algo útil que quieras recordar…" rows={2} className={inputClass} />
              </div>
            </div>

            {/* Hitos */}
            <div className="border-t border-border pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Hitos / Versiones</p>
                <button type="button" onClick={addVersion}
                  className="text-[11px] font-semibold h-7 px-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
                  + Agregar hito
                </button>
              </div>
              {form.versiones.length === 0 && (
                <p className="text-[12px] text-muted-foreground italic">Sin hitos definidos aún.</p>
              )}
              <div className="space-y-2">
                {form.versiones.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={v.nombre} onChange={e => updateVersion(i, "nombre", e.target.value)}
                      placeholder="Ej: v1.0 Beta" className={inputClass} />
                    <input type="date" value={v.fecha} onChange={e => updateVersion(i, "fecha", e.target.value)}
                      className="bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 w-40 flex-shrink-0" />
                    <select value={v.estado || ""} onChange={e => updateVersion(i, "estado", e.target.value)}
                      className="bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 w-36 flex-shrink-0 cursor-pointer">
                      <option value="">Estado</option>
                      {VERSION_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => removeVersion(i)}
                      className="text-destructive text-xl leading-none flex-shrink-0 hover:opacity-60 px-1 transition-opacity">×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Archivos del proyecto (solo en modo edición) ── */}
          {isEdit && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-foreground">Archivos de la actividad</h3>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadProgress !== null}
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-50 transition-all hover:opacity-90"
                  style={{ background: "oklch(0.52 0.22 295)" }}>
                  {uploadProgress !== null ? `${uploadProgress}%` : "↑ Subir archivo"}
                </button>
              </div>

              {uploadProgress !== null && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%`, background: "oklch(0.52 0.22 295)" }} />
                </div>
              )}
              {uploadError && <p className="text-[12px] text-destructive">{uploadError}</p>}

              {documents.length === 0 ? (
                <p className="text-[12px] text-muted-foreground italic">Sin archivos aún. Sube documentos, imágenes o presentaciones de la actividad.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(d => {
                    const fi = getFileTypeInfo(d.tipo, d.nombre)
                    return (
                      <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border/60 bg-muted/30">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                          style={{ color: fi.color, backgroundColor: fi.bg }}>{fi.label}</span>
                        <span className="flex-1 text-[12px] text-foreground truncate">{d.nombre}</span>
                        {d.size && <span className="text-[11px] text-muted-foreground flex-shrink-0">{formatFileSize(d.size)}</span>}
                        <button type="button" onClick={() => downloadFile(d.url, d.nombre)}
                          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 text-[13px]" title="Descargar">↓</button>
                        <button type="button" onClick={() => handleDeleteDoc(d)}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 text-[15px] leading-none">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          {saveError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-2.5">
              <p className="text-[12px] text-destructive">{saveError}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="h-10 px-6 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, oklch(0.52 0.13 165), oklch(0.44 0.14 185))", boxShadow: "0 4px 14px oklch(0.52 0.13 165 / 30%)" }}>
              {saving ? "Guardando…" : isEdit ? "Actualizar actividad" : "Guardar actividad"}
            </button>
            <button type="button" onClick={() => navigate(`/semillero/${semilleroId}/colleague/${id}`)}
              className="h-10 px-5 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
              Cancelar
            </button>
          </div>

        </form>
        </div>
      </div>
      <Footer />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={handlePdfImport}
      />
    </div>
  )
}
