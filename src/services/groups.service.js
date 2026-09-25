import {
  doc, getDoc, updateDoc, arrayRemove, arrayUnion,
  collection, addDoc, getDocs, deleteDoc,
  query, orderBy, serverTimestamp, deleteField,
} from "firebase/firestore"
import { db } from "@/services/firebase"

// ── Grupo ──────────────────────────────────────────────────────────────────
export const getGrupo = async (id) => {
  const snap = await getDoc(doc(db, "equipos", id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const getGrupos = async () => {
  const snap = await getDocs(collection(db, "equipos"))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Proyectos (array en el documento) ─────────────────────────────────────
export const addGrupoProject = async (grupoId, proyecto) => {
  const ref = doc(db, "equipos", grupoId)
  const snap = await getDoc(ref)
  const proyectos = snap.data().proyectos || []
  return await updateDoc(ref, { proyectos: [...proyectos, proyecto] })
}

export const deleteGrupoProject = async (grupoId, proyecto) => {
  return await updateDoc(doc(db, "equipos", grupoId), { proyectos: arrayRemove(proyecto) })
}

const sameProject = (a, b) =>
  a.nombre === b.nombre && (a.fechaInicio || "") === (b.fechaInicio || "")

export const updateGrupoProject = async (grupoId, oldProject, newProject) => {
  const ref = doc(db, "equipos", grupoId)
  const snap = await getDoc(ref)
  const proyectos = snap.data().proyectos || []
  let replaced = false
  const updated = proyectos.map(p => {
    if (!replaced && sameProject(p, oldProject)) { replaced = true; return newProject }
    return p
  })
  return await updateDoc(ref, { proyectos: updated })
}

// ── Bitácora (subcollection) ───────────────────────────────────────────────
export const addGrupoLog = async (grupoId, nota, user, archivos = []) => {
  return await addDoc(collection(db, "equipos", grupoId, "logs"), {
    nota,
    archivos,
    createdAt: serverTimestamp(),
    creadoPor: user.uid,
    creadoPorNombre: user.displayName || user.email,
  })
}

export const getGrupoLogs = async (grupoId) => {
  const snap = await getDocs(query(collection(db, "equipos", grupoId, "logs"), orderBy("createdAt", "desc")))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deleteGrupoLog = async (grupoId, logId) => {
  return await deleteDoc(doc(db, "equipos", grupoId, "logs", logId))
}

export const updateGrupoLog = async (grupoId, logId, nota) => {
  return await updateDoc(doc(db, "equipos", grupoId, "logs", logId), { nota })
}

// ── Tareas (subcollection) ────────────────────────────────────────────────
export const addGrupoTask = async (grupoId, task) => {
  return await addDoc(collection(db, "equipos", grupoId, "tareas"), {
    ...task,
    avance: Number(task.avance) || 0,
    estado: "Pendiente",
    createdAt: serverTimestamp(),
  })
}

export const updateGrupoTask = async (grupoId, taskId, data) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), data)
}

export const getGrupoTasks = async (grupoId) => {
  const snap = await getDocs(query(collection(db, "equipos", grupoId, "tareas"), orderBy("createdAt", "desc")))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const updateGrupoTaskStatus = async (grupoId, taskId, estado) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), { estado })
}

export const deleteGrupoTask = async (grupoId, taskId) => {
  return await deleteDoc(doc(db, "equipos", grupoId, "tareas", taskId))
}

export const updateGrupoTaskAvance = async (grupoId, taskId, avance, nuevoEstado) => {
  const data = { avance }
  if (nuevoEstado) data.estado = nuevoEstado
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), data)
}

export const addGrupoTaskFile = async (grupoId, taskId, archivo) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), { archivos: arrayUnion(archivo) })
}

export const removeGrupoTaskFile = async (grupoId, taskId, archivo) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), { archivos: arrayRemove(archivo) })
}

export const solicitarPlazoGrupoTask = async (grupoId, taskId, solicitud) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), { solicitudPlazo: solicitud })
}

export const aceptarPlazoGrupoTask = async (grupoId, taskId, nuevaFechaLimite) => {
  const data = { solicitudPlazo: deleteField(), plazoRechazado: deleteField() }
  if (nuevaFechaLimite) {
    data.fechaLimite = nuevaFechaLimite
    data.plazoAceptado = { nuevaFecha: nuevaFechaLimite }
  }
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), data)
}

export const rechazarPlazoGrupoTask = async (grupoId, taskId) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), {
    solicitudPlazo: deleteField(),
    plazoAceptado: deleteField(),
    plazoRechazado: true,
  })
}

export const dismissPlazoGrupoResultado = async (grupoId, taskId) => {
  return await updateDoc(doc(db, "equipos", grupoId, "tareas", taskId), {
    plazoAceptado: deleteField(),
    plazoRechazado: deleteField(),
  })
}

// ── Retroalimentación (subcollection) ────────────────────────────────────
export const addGrupoFeedback = async (grupoId, texto, user) => {
  return await addDoc(collection(db, "equipos", grupoId, "retroalimentacion"), {
    texto,
    createdAt: serverTimestamp(),
    creadoPor: user.uid,
    creadoPorNombre: user.displayName || user.email,
  })
}

export const getGrupoFeedback = async (grupoId) => {
  const snap = await getDocs(query(collection(db, "equipos", grupoId, "retroalimentacion"), orderBy("createdAt", "desc")))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deleteGrupoFeedback = async (grupoId, fbId) => {
  return await deleteDoc(doc(db, "equipos", grupoId, "retroalimentacion", fbId))
}

export const updateGrupoFeedback = async (grupoId, fbId, texto) => {
  return await updateDoc(doc(db, "equipos", grupoId, "retroalimentacion", fbId), { texto })
}

// ── Contactos importados (subcollection) ──────────────────────────────────
export const importGroupContacts = async (grupoId, contactos, agregadoPor) => {
  const col = collection(db, "equipos", grupoId, "contactos")
  const promises = contactos.map(c =>
    addDoc(col, { ...c, agregadoPor, agregadoEn: serverTimestamp() })
  )
  await Promise.all(promises)
  // Guardar conteo en el documento del equipo para mostrarlo en el Dashboard
  const snap = await getDocs(collection(db, "equipos", grupoId, "contactos"))
  await updateDoc(doc(db, "equipos", grupoId), { participantesCount: snap.size })
}

export const getGroupContactsCount = async (grupoId) => {
  const snap = await getDocs(collection(db, "equipos", grupoId, "contactos"))
  return snap.size
}

export const getGroupContacts = async (grupoId) => {
  const snap = await getDocs(query(collection(db, "equipos", grupoId, "contactos"), orderBy("agregadoEn", "desc")))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deleteGroupContact = async (grupoId, contactId) => {
  await deleteDoc(doc(db, "equipos", grupoId, "contactos", contactId))
  const snap = await getDocs(collection(db, "equipos", grupoId, "contactos"))
  await updateDoc(doc(db, "equipos", grupoId), { participantesCount: snap.size })
}

export const deleteAllGroupContacts = async (grupoId) => {
  const snap = await getDocs(collection(db, "equipos", grupoId, "contactos"))
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
  await updateDoc(doc(db, "equipos", grupoId), { participantesCount: 0 })
}
