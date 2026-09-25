import { collection, addDoc, getDocs, query, where, serverTimestamp, deleteDoc, updateDoc, doc } from "firebase/firestore"
import { db } from "@/services/firebase"

export const addLog = async ({ colleagueId, colleagueName, nota, userId, semilleroId, archivos }) => {
  return await addDoc(collection(db, "logs"), {
    colleagueId,
    colleagueName,
    nota,
    creadoPor: userId,
    semilleroId: semilleroId || null,
    archivos: archivos || [],
    createdAt: serverTimestamp(),
  })
}

export const getLogs = async (colleagueId) => {
  const q = query(collection(db, "logs"), where("colleagueId", "==", colleagueId))
  const snapshot = await getDocs(q)
  const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  return logs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
}

export const getAllLogs = async () => {
  const snapshot = await getDocs(collection(db, "logs"))
  const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  return logs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
}

export const deleteLog = async (logId) => {
  return await deleteDoc(doc(db, "logs", logId))
}

export const updateLog = async (logId, nota) => {
  return await updateDoc(doc(db, "logs", logId), { nota })
}
