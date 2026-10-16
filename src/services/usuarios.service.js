import { doc, getDoc, setDoc, collection, getDocs, query, where, limit, serverTimestamp } from "firebase/firestore"
import { db } from "@/services/firebase"

export const ensureUsuarioDoc = async (uid, { email, nombre } = {}) => {
  const ref = doc(db, "usuarios", uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    // Buscar si hay un rol pre-asignado en el companion (asignado antes del primer login)
    let initialRole = "member"
    let initialSemilleroId = null
    if (email) {
      try {
        const q = query(collection(db, "companeros"), where("email", "==", email.toLowerCase()), limit(1))
        const cSnap = await getDocs(q)
        if (!cSnap.empty) {
          const cData = cSnap.docs[0].data()
          if (cData.rolAsignado) initialRole = cData.rolAsignado
          if (cData.semilleroId) initialSemilleroId = cData.semilleroId
        }
      } catch {}
    }
    const data = {
      email: email || "",
      nombre: nombre || (email ? email.split("@")[0] : ""),
      role: initialRole,
      semilleroId: initialSemilleroId,
      createdAt: serverTimestamp(),
    }
    await setDoc(ref, data)
    return data
  }
  return snap.data()
}

export const getUsuarioDoc = async (uid) => {
  const snap = await getDoc(doc(db, "usuarios", uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const setUsuarioRole = async (uid, role, semilleroId = null) => {
  await setDoc(doc(db, "usuarios", uid), { role, semilleroId }, { merge: true })
}

export const getAllUsuarios = async () => {
  const snap = await getDocs(collection(db, "usuarios"))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getSuperAdmins = async () => {
  const snap = await getDocs(query(collection(db, "usuarios"), where("role", "==", "superadmin")))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getAdminsBySemillero =async (semilleroId) => {
  const q = query(collection(db, "usuarios"), where("semilleroId", "==", semilleroId), where("role", "==", "admin"))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
