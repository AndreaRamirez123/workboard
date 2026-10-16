import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, arrayRemove, arrayUnion, query, where, serverTimestamp } from "firebase/firestore"
import { db } from "@/services/firebase"
import { format } from "date-fns"

export const getColleagues = async () => {
  const snapshot = await getDocs(collection(db, "companeros"))
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const getColleaguesBySemillero = async (semilleroId) => {
  const q = query(collection(db, "companeros"), where("semilleroId", "==", semilleroId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const bulkCreateColleagues = async (companeros, semilleroId, createdByUid) => {
  const results = await Promise.allSettled(
    companeros.map(c =>
      addDoc(collection(db, "companeros"), {
        nombre:      c.nombre || "",
        email:       c.email || "",
        whatsapp:    c.whatsapp || "",
        area:        c.area || "",
        rol:         c.rol || "",
        herramientas: [],
        trabajaEn:   "",
        notas:       c.notas || "",
        colorHue:    null,
        avatarUrl:   null,
        proyectos:   [],
        semilleroId,
        creadoPor:   createdByUid,
        createdAt:   serverTimestamp(),
      })
    )
  )
  const ok = results.filter(r => r.status === "fulfilled").length
  const fail = results.filter(r => r.status === "rejected").length
  return { ok, fail }
}

export const migrateColleaguesToSemillero = async (semilleroId) => {
  const snap = await getDocs(collection(db, "companeros"))
  const updates = snap.docs
    .filter(d => !d.data().semilleroId)
    .map(d => updateDoc(doc(db, "companeros", d.id), { semilleroId }))
  await Promise.all(updates)
  return updates.length
}

export const getColleagueByEmail = async (email) => {
  const q = query(collection(db, "companeros"), where("email", "==", email))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export const linkColleagueUid = async (colleagueId, uid) => {
  return await updateDoc(doc(db, "companeros", colleagueId), { uid })
}

export const deleteColleague = async (id) => {
  return await deleteDoc(doc(db, "companeros", id))
}

export const addProject = async (colleagueId, proyecto) => {
  return await updateDoc(doc(db, "companeros", colleagueId), {
    proyectos: arrayUnion(proyecto)
  })
}

export const deleteProject = async (colleagueId, proyecto) => {
  return await updateDoc(doc(db, "companeros", colleagueId), {
    proyectos: arrayRemove(proyecto)
  })
}

const sameProject = (a, b) =>
  a.nombre === b.nombre && (a.fechaInicio || "") === (b.fechaInicio || "")

export const updateProject = async (colleagueId, oldProject, newProject) => {
  const docRef = doc(db, "companeros", colleagueId)
  const snap = await getDoc(docRef)
  const proyectos = snap.data().proyectos || []
  let replaced = false
  const updated = proyectos.map(p => {
    if (!replaced && sameProject(p, oldProject)) { replaced = true; return newProject }
    return p
  })
  return await updateDoc(docRef, { proyectos: updated })
}

// ── Licencia (maternidad, incapacidad, etc.) ────────────────────────────────
export const LICENCIA_TIPOS = [
  { tipo: "Maternidad",             icono: "🍼" },
  { tipo: "Paternidad",             icono: "👶" },
  { tipo: "Incapacidad médica",     icono: "🩺" },
  { tipo: "Luto",                   icono: "🕊️" },
  { tipo: "Calamidad doméstica",    icono: "🏠" },
  { tipo: "Vacaciones",             icono: "🌴" },
  { tipo: "Licencia no remunerada", icono: "📄" },
  { tipo: "Otra",                   icono: "📌" },
]
export const licenciaIcono = (tipo) => LICENCIA_TIPOS.find(t => t.tipo === tipo)?.icono || "📌"

// licencia: { tipo, desde: "yyyy-MM-dd", hasta: "yyyy-MM-dd" | "", nota } — null para quitarla
export const setLicencia = async (colleagueId, licencia) => {
  return await updateDoc(doc(db, "companeros", colleagueId), { licencia: licencia || null })
}

// true si la persona está en licencia en la fecha dada (hasta vacío = indefinida)
export const isEnLicencia = (companero, fecha = new Date()) => {
  const l = companero?.licencia
  if (!l?.desde) return false
  const hoy = format(fecha, "yyyy-MM-dd")
  return l.desde <= hoy && (!l.hasta || l.hasta >= hoy)
}

export const updatePerfilProfesional =async (colleagueId, key, data) => {
  return await updateDoc(doc(db, "companeros", colleagueId), {
    [`perfilProfesional.${key}`]: data,
  })
}
