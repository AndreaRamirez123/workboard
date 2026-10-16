const functions = require("firebase-functions")
const { initializeApp } = require("firebase-admin/app")
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore")

const app = initializeApp()
// El proyecto usa la base de datos nombrada "default" (sin paréntesis),
// no la base (default) estándar. getFirestore() sin ID conectaría al lugar incorrecto.
const db = getFirestore(app, "default")

// API key: definida en functions/.env.desarrollo-investigaciones
const getKey = () => process.env.WORKBOARD_API_KEY || ""

const auth = (req) => {
  const k = req.headers["x-api-key"] || req.body?.apiKey || req.query?.apiKey
  return k && k === getKey()
}

const cors = (res) => {
  res.set("Access-Control-Allow-Origin", "*")
  res.set("Access-Control-Allow-Headers", "Content-Type, x-api-key")
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
}

// ─────────────────────────────────────────────
// POST /addLog
// Crea una entrada en bitácora desde WhatsApp
//
// Body JSON:
//   { "email": "carlos@cun.edu.co", "nota": "Avancé en el módulo X" }
// Header:
//   x-api-key: <clave>
//
// Respuesta OK:
//   { "ok": true, "logId": "abc123", "colleague": "Carlos Pérez" }
// ─────────────────────────────────────────────
exports.addLog = functions.https.onRequest(async (req, res) => {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).send("")
  if (!auth(req)) return res.status(401).json({ error: "No autorizado — revisa x-api-key" })
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" })

  const { email, whatsapp, nota } = req.body || {}
  if ((!email && !whatsapp) || !nota) {
    return res.status(400).json({ error: "Se requieren (email o whatsapp) y nota en el body" })
  }

  try {
    // Identificar compañero por whatsapp primero, luego por email
    let snap
    if (whatsapp) {
      const num = String(whatsapp).replace(/\D/g, "")
      snap = await db.collection("companeros").where("whatsapp", "==", num).limit(1).get()
      if (snap.empty) {
        return res.status(404).json({ error: `No se encontró ningún compañero con WhatsApp: ${num}` })
      }
    } else {
      snap = await db.collection("companeros")
        .where("email", "==", email.trim().toLowerCase())
        .limit(1)
        .get()
      if (snap.empty) {
        return res.status(404).json({ error: `No se encontró ningún compañero con email: ${email}` })
      }
    }

    const companeroDoc = snap.docs[0]
    const companero = companeroDoc.data()

    const logRef = await db.collection("logs").add({
      colleagueId: companeroDoc.id,
      colleagueName: companero.nombre,
      nota: nota.trim(),
      creadoPor: "whatsapp-bot",
      createdAt: FieldValue.serverTimestamp(),
    })

    return res.json({ ok: true, logId: logRef.id, colleague: companero.nombre })
  } catch (err) {
    console.error("[addLog] Error interno:", err.code, err.message)
    const isPermission = err.code === 7 || err.message?.includes("PERMISSION_DENIED")
    return res.status(500).json({
      error: "Error interno del servidor",
      causa: isPermission
        ? "El servicio no tiene permisos sobre la base de datos Firestore. Contactar a andrea_ramirezt@cun.edu.co — se requiere otorgar el rol 'Cloud Datastore User' al service account de Cloud Functions."
        : err.message,
      code: err.code || null,
    })
  }
})

// ─────────────────────────────────────────────
// GET /getColleagues
// Devuelve lista de compañeros (id, nombre, email)
// Útil para mapear número de WhatsApp → email en n8n
//
// Header: x-api-key: <clave>
// ─────────────────────────────────────────────
exports.getColleagues = functions.https.onRequest(async (req, res) => {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).send("")
  if (!auth(req)) return res.status(401).json({ error: "No autorizado" })

  const snap = await db.collection("companeros").get()
  const colleagues = snap.docs.map(d => ({
    id: d.id,
    nombre: d.data().nombre,
    email: d.data().email || null,
    whatsapp: d.data().whatsapp || null,
  }))

  return res.json({ colleagues })
})

// ─────────────────────────────────────────────
// GET /pendingLogs
// Devuelve quiénes NO han llenado bitácora esta semana
// Ideal para el recordatorio automático de los viernes
//
// Header: x-api-key: <clave>
//
// Respuesta:
//   { "pending": [{ "nombre": "Carlos", "email": "..." }], "weekStart": "2026-07-06" }
// ─────────────────────────────────────────────
exports.pendingLogs = functions.https.onRequest(async (req, res) => {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).send("")
  if (!auth(req)) return res.status(401).json({ error: "No autorizado" })

  // Lunes de la semana actual (hora Colombia UTC-5)
  const now = new Date()
  const utcOffset = -5 * 60
  const local = new Date(now.getTime() + utcOffset * 60000)
  const day = local.getDay()
  const daysToMon = day === 0 ? 6 : day - 1
  const monday = new Date(local)
  monday.setDate(local.getDate() - daysToMon)
  monday.setHours(0, 0, 0, 0)
  const mondayUTC = new Date(monday.getTime() - utcOffset * 60000)

  const logsSnap = await db.collection("logs")
    .where("createdAt", ">=", Timestamp.fromDate(mondayUTC))
    .get()

  const logged = new Set(logsSnap.docs.map(d => d.data().colleagueId))

  // Quienes están en licencia hoy (maternidad, incapacidad…) no deben bitácora
  const hoy = local.toISOString().slice(0, 10)
  const enLicencia = (c) => !!c.licencia?.desde && c.licencia.desde <= hoy && (!c.licencia.hasta || c.licencia.hasta >= hoy)

  const companSnap = await db.collection("companeros").get()
  const licencias = companSnap.docs.filter(d => enLicencia(d.data()))
  const pending = companSnap.docs
    .filter(d => !logged.has(d.id) && !enLicencia(d.data()))
    .map(d => ({ nombre: d.data().nombre, email: d.data().email || null }))

  return res.json({
    pending,
    total: companSnap.size,
    pendingCount: pending.length,
    enLicencia: licencias.map(d => ({ nombre: d.data().nombre, tipo: d.data().licencia.tipo || null })),
    weekStart: monday.toISOString().slice(0, 10),
  })
})

// ─────────────────────────────────────────────
// GET /pendingNotifications
// Cola de notificaciones WPP pendientes de enviar.
// n8n hace polling cada N minutos, lee esta lista,
// envía los mensajes de WhatsApp y luego llama /ackNotifications.
//
// Header: x-api-key: <clave>
//
// Respuesta:
//   {
//     "notifications": [
//       {
//         "id": "abc123",
//         "tipo": "tarea_asignada",          -- o "miembro_grupo"
//         "whatsapp": "573153542899",
//         "nombre": "Carlos Pérez",
//         "tarea": { "titulo": "...", "descripcion": "...", "fechaLimite": "...", "avance": 0 },
//         "asignadoPor": "Andrea Ramírez",
//         "createdAt": "2026-07-21T14:00:00.000Z"
//       },
//       {
//         "id": "def456",
//         "tipo": "miembro_grupo",
//         "whatsapp": "573153542899",
//         "nombre": "Carlos Pérez",
//         "grupo": { "nombre": "Equipo IA", "descripcion": "..." }
//       }
//     ],
//     "total": 2
//   }
// ─────────────────────────────────────────────
exports.pendingNotifications = functions.https.onRequest(async (req, res) => {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).send("")
  if (!auth(req)) return res.status(401).json({ error: "No autorizado" })

  const snap = await db.collection("wpp_queue")
    .where("processed", "==", false)
    .orderBy("createdAt", "asc")
    .limit(50)
    .get()

  const notifications = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
  }))

  return res.json({ notifications, total: notifications.length })
})

// ─────────────────────────────────────────────
// POST /ackNotifications
// Marca notificaciones como enviadas para no reenviarlas.
// n8n llama este endpoint después de enviar cada mensaje.
//
// Header: x-api-key: <clave>
// Body JSON:
//   { "ids": ["abc123", "def456"] }
//
// Respuesta:
//   { "ok": true, "updated": 2 }
// ─────────────────────────────────────────────
exports.ackNotifications = functions.https.onRequest(async (req, res) => {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).send("")
  if (!auth(req)) return res.status(401).json({ error: "No autorizado" })
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST" })

  const { ids } = req.body || {}
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Se requiere ids: [string]" })
  }

  const batch = db.batch()
  ids.forEach(id => {
    batch.update(db.collection("wpp_queue").doc(id), {
      processed: true,
      processedAt: FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()

  return res.json({ ok: true, updated: ids.length })
})
