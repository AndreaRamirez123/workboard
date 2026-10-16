import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/services/firebase"
import { getSuperAdmins, getAdminsBySemillero } from "@/services/usuarios.service"

export const notificarTareaCompletada = async ({ taskTitle, assigneeName, grupoNombre, path, tipo, semilleroId }) => {
  return await addDoc(collection(db, "notificaciones"), {
    tipo: tipo || "tarea_completada",
    taskTitle,
    assigneeName: assigneeName || null,
    grupoNombre: grupoNombre || null,
    semilleroId: semilleroId || null,
    path,
    createdAt: serverTimestamp(),
  })
}

// Aviso de licencia a superadmins + coordinadores del semillero (menos quien la registra)
export const notificarLicencia = async ({ nombre, licencia, terminada, semilleroId, path, excludeUid }) => {
  const [supers, admins] = await Promise.all([
    getSuperAdmins().catch(() => []),
    semilleroId ? getAdminsBySemillero(semilleroId).catch(() => []) : [],
  ])
  const uids = [...new Set([...supers, ...admins].map(u => u.id))].filter(uid => uid !== excludeUid)
  const titulo = terminada
    ? `${nombre} terminó su licencia`
    : `${nombre} está en licencia de ${licencia.tipo.toLowerCase()}`
  const subtitulo = terminada
    ? "Vuelve a aparecer en los pendientes de bitácora"
    : `Desde ${licencia.desde}${licencia.hasta ? ` hasta ${licencia.hasta}` : " · sin fecha de regreso"}`
  await Promise.all(uids.map(toUid =>
    crearNotificacionUsuario({ toUid, tipo: "licencia", titulo, subtitulo, path, semilleroId })
  ))
}

// Notificación personal al compañero — visible en su campana
export const crearNotificacionUsuario = async ({ toUid, tipo, titulo, subtitulo, path, semilleroId }) => {
  if (!toUid) return null
  return await addDoc(collection(db, "notif_usuario", toUid, "items"), {
    tipo: tipo || "general",
    titulo,
    subtitulo: subtitulo || null,
    semilleroId: semilleroId || null,
    path: path || null,
    createdAt: serverTimestamp(),
  })
}
