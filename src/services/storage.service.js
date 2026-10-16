import { ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll, getMetadata } from "firebase/storage"
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore"
import { storage, db } from "@/services/firebase"

export const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB

// Sube un archivo y guarda su metadata en Firestore
export const uploadDocument = (colleagueId, file, { onProgress, uploadedBy, uploadedByName, proyectoNombre } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const safeProjName = proyectoNombre ? proyectoNombre.replace(/[^a-zA-Z0-9._-]/g, "_") : "_general"
    const storagePath = `documentos/${colleagueId}/${safeProjName}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)

    task.on(
      "state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          const docRef = await addDoc(collection(db, "companeros", colleagueId, "documentos"), {
            nombre: file.name,
            url,
            storagePath,
            size: file.size,
            tipo: file.type || "application/octet-stream",
            proyectoNombre: proyectoNombre || null,
            subidoPor: uploadedBy || null,
            subidoPorNombre: uploadedByName || null,
            createdAt: serverTimestamp(),
          })
          resolve({ id: docRef.id, nombre: file.name, url, size: file.size, tipo: file.type, storagePath, proyectoNombre: proyectoNombre || null })
        } catch (err) {
          reject(err)
        }
      }
    )
  })
}

export const getDocuments = async (colleagueId) => {
  const snap = await getDocs(
    query(collection(db, "companeros", colleagueId, "documentos"), orderBy("createdAt", "desc"))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deleteDocument = async (colleagueId, docId, storagePath) => {
  await deleteObject(ref(storage, storagePath))
  await deleteDoc(doc(db, "companeros", colleagueId, "documentos", docId))
}

// ── Documentos de grupo ──────────────────────────────────────────────────────
export const uploadGroupDocument = (groupId, file, { onProgress, uploadedBy, uploadedByName, proyectoNombre } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const safeProjName = proyectoNombre ? proyectoNombre.replace(/[^a-zA-Z0-9._-]/g, "_") : "_general"
    const storagePath = `documentos-grupo/${groupId}/${safeProjName}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)

    task.on(
      "state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          const docRef = await addDoc(collection(db, "equipos", groupId, "documentos"), {
            nombre: file.name, url, storagePath,
            size: file.size, tipo: file.type || "application/octet-stream",
            proyectoNombre: proyectoNombre || null,
            subidoPor: uploadedBy || null, subidoPorNombre: uploadedByName || null,
            createdAt: serverTimestamp(),
          })
          resolve({ id: docRef.id, nombre: file.name, url, size: file.size, tipo: file.type, storagePath, proyectoNombre: proyectoNombre || null })
        } catch (err) { reject(err) }
      }
    )
  })
}

export const getGroupDocuments = async (groupId) => {
  const snap = await getDocs(
    query(collection(db, "equipos", groupId, "documentos"), orderBy("createdAt", "desc"))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const deleteGroupDocument = async (groupId, docId, storagePath) => {
  await deleteObject(ref(storage, storagePath))
  await deleteDoc(doc(db, "equipos", groupId, "documentos", docId))
}

// ── Avatar de perfil ──────────────────────────────────────────────────────────
export const uploadAvatar = (colleagueId, file, { onProgress } = {}) => {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase() || "jpg"
    const storagePath = `avatares/${colleagueId}/avatar.${ext}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)
    task.on("state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, storagePath })
        } catch (err) { reject(err) }
      }
    )
  })
}

// ── Archivos adjuntos a tareas individuales ──────────────────────────────────
export const uploadTaskFile = (colleagueId, taskId, file, { onProgress } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const storagePath = `tareas/${colleagueId}/${taskId}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)
    task.on("state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, nombre: file.name, size: file.size, tipo: file.type || "application/octet-stream", storagePath })
        } catch (err) { reject(err) }
      }
    )
  })
}

export const deleteTaskFile = async (storagePath) => {
  await deleteObject(ref(storage, storagePath))
}

// ── Archivos de perfil profesional (HV, portafolio, PDA) ─────────────────────
export const uploadPerfilFile = (colleagueId, tipo, file, { onProgress } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const storagePath = `perfiles/${colleagueId}/${tipo}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)
    task.on(
      "state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, nombre: file.name, size: file.size, storagePath })
        } catch (err) { reject(err) }
      }
    )
  })
}

export const deletePerfilFile = async (storagePath) => {
  if (!storagePath) return
  await deleteObject(ref(storage, storagePath))
}

// ── Archivos adjuntos a tareas de grupo ──────────────────────────────────────
// ── Adjunto genérico (proyectos, logs, etc.) ─────────────────────────────────
export const uploadAttachment = (basePath, file, { onProgress } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const storagePath = `${basePath}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)
    task.on("state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, nombre: file.name, size: file.size, tipo: file.type || "application/octet-stream", storagePath })
        } catch (err) { reject(err) }
      }
    )
  })
}

// ── Todos los archivos guardados de un compañero (directo de Storage) ────────
// Incluye archivos que no quedaron vinculados a ninguna actividad o nota.
// carpetas: subconjunto de ["proyectos", "documentos", "logs", "tareas"]
const listRecursive = async (folderRef) => {
  const res = await listAll(folderRef)
  const nested = await Promise.all(res.prefixes.map(listRecursive))
  return [...res.items, ...nested.flat()]
}

export const listColleagueFiles = async (colleagueId, carpetas) => {
  const items = (await Promise.all(
    carpetas.map(c => listRecursive(ref(storage, `${c}/${colleagueId}`)).catch(() => []))
  )).flat()
  const files = await Promise.all(items.map(async (item) => {
    const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item).catch(() => null)])
    const [carpeta, , ...rest] = item.fullPath.split("/")
    return {
      nombre: item.name.replace(/^\d{10,}_/, ""),
      url,
      storagePath: item.fullPath,
      carpeta,
      subcarpeta: rest.length > 1 ? rest[0].replace(/_/g, " ") : null,
      size: meta?.size || 0,
      tipo: meta?.contentType || "",
      fecha: meta?.timeCreated ? new Date(meta.timeCreated) : null,
    }
  }))
  return files.sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
}

export const uploadGrupoTaskFile =(grupoId, taskId, file, { onProgress } = {}) => {
  return new Promise((resolve, reject) => {
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const storagePath = `tareas-grupo/${grupoId}/${taskId}/${safeName}`
    const storageRef = ref(storage, storagePath)
    const task = uploadBytesResumable(storageRef, file)
    task.on("state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, nombre: file.name, size: file.size, tipo: file.type || "application/octet-stream", storagePath })
        } catch (err) { reject(err) }
      }
    )
  })
}
