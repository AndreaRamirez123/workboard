import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import { doc, getDoc, collection, getDocs, updateDoc, arrayUnion } from "firebase/firestore"
import { auth, googleProvider, db } from "@/services/firebase"
import { getColleagueByEmail, linkColleagueUid } from "@/services/colleagues.service"
import { ensureUsuarioDoc } from "@/services/usuarios.service"

// Superadmins fijos — fuente de verdad para el nivel más alto
export const SUPER_ADMIN_EMAILS = ["andrea_ramirezt@cun.edu.co", "angela_bernalm@cun.edu.co", "jarvey_gonzalez@cun.edu.co"]

// Directivos institucionales — aparecen en la lista de miembros de cada equipo con su rol
export const DIRECTIVOS = [
  { email: "angela_bernalm@cun.edu.co", nombre: "Angela Bernal", rol: "Directora", hue: 280 },
  { email: "jarvey_gonzalez@cun.edu.co", nombre: "Jarvey González", rol: "Vicerrector", hue: 210 },
]

async function backfillMemberUids(companionId, uid) {
  try {
    const snap = await getDocs(collection(db, "equipos"))
    const updates = []
    snap.docs.forEach(d => {
      const data = d.data()
      const miembros = data.miembros || []
      const memberUids = data.memberUids || []
      if (miembros.includes(companionId) && !memberUids.includes(uid)) {
        updates.push(updateDoc(doc(db, "equipos", d.id), { memberUids: arrayUnion(uid) }))
      }
    })
    await Promise.all(updates)
  } catch (e) {
    console.error("[Workboard] Error en backfillMemberUids:", e.message)
  }
}

const AuthContext = createContext(null)
const cacheKey = (email) => `wb_cid_${email}`

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [myColleagueId, setMyColleagueId] = useState(null)
  const [mySemilleroId, setMySemilleroId] = useState(null)
  const [role, setRole] = useState(null) // "superadmin" | "admin" | "member"

  // Derived flags
  const isSuperAdmin = role === "superadmin"
  const isAdmin = role === "admin" || role === "superadmin"
  const isCoordinador = isAdmin // alias para retrocompatibilidad

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Dominio no permitido
      if (currentUser && !currentUser.email?.endsWith("@cun.edu.co")) {
        await signOut(auth)
        setAuthError("Solo cuentas @cun.edu.co tienen acceso a Workboard.")
        setUser(null); setMyColleagueId(null); setRole(null)
        setLoading(false)
        return
      }

      // Sin sesión
      if (!currentUser) {
        setAuthError(null); setUser(null); setMyColleagueId(null)
        setMySemilleroId(null); setRole(null)
        setLoading(false)
        return
      }

      setAuthError(null)
      setUser(currentUser)

      const isSA = SUPER_ADMIN_EMAILS.includes(currentUser.email)

      try {
        if (!isSA) {
          // Leer / crear doc en usuarios/{uid}
          const userData = await ensureUsuarioDoc(currentUser.uid, {
            email: currentUser.email,
            nombre: currentUser.displayName || "",
          })
          setRole(userData.role || "member")
          if (userData.semilleroId) setMySemilleroId(userData.semilleroId)
        } else {
          setRole("superadmin")
        }

        // Vincular perfil de compañero (todos los roles)
        const cached = localStorage.getItem(cacheKey(currentUser.email))
        if (cached) {
          const snap = await getDoc(doc(db, "companeros", cached))
          if (snap.exists()) {
            setMyColleagueId(cached)
            if (!snap.data()?.uid) {
              linkColleagueUid(cached, currentUser.uid).catch(() => {})
              backfillMemberUids(cached, currentUser.uid).catch(() => {})
            }
            // Completar semilleroId si no vino del doc de usuario
            if (!isSA && snap.data().semilleroId) {
              setMySemilleroId(prev => prev || snap.data().semilleroId)
            }
            setLoading(false)
            return
          }
          localStorage.removeItem(cacheKey(currentUser.email))
        }

        const companion = await getColleagueByEmail(currentUser.email)
        if (companion) {
          setMyColleagueId(companion.id)
          localStorage.setItem(cacheKey(currentUser.email), companion.id)
          if (!companion.uid) {
            await linkColleagueUid(companion.id, currentUser.uid)
            backfillMemberUids(companion.id, currentUser.uid).catch(() => {})
          }
          if (!isSA && companion.semilleroId) {
            setMySemilleroId(prev => prev || companion.semilleroId)
          }
        } else {
          setMyColleagueId(null)
        }
      } catch (e) {
        console.error("[Workboard] Error cargando usuario:", e.code, e.message)
        setRole(isSA ? "superadmin" : "member")
      }

      setLoading(false)
    })
    return unsubscribe
  }, [])

  const loginWithGoogle = async () => {
    try {
      setAuthError(null)
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Error login:", error.code, error.message)
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{
      user, loading, loginWithGoogle, logout, authError,
      myColleagueId, mySemilleroId,
      role, isSuperAdmin, isAdmin, isCoordinador,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
