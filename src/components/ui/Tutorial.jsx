import { useState, useEffect, useCallback, useRef } from "react"

const STEPS = [
  {
    icon: "👋",
    title: "¡Bienvenido a Workboard!",
    desc: "Tu plataforma para hacer seguimiento del equipo. En unos pasos te mostramos todo lo que puedes hacer.",
    color: "165",
  },
  {
    icon: "👥",
    title: "Tu equipo en tarjetas",
    desc: "Cada tarjeta es un integrante: su rol, actividades activas, nivel de avance y herramientas. Haz clic en una para entrar al perfil completo.",
    highlight: "[data-tour='cards']",
    color: "260",
    tip: "Haz clic en cualquier tarjeta para ver el perfil detallado",
  },
  {
    icon: "🔍",
    title: "Búsqueda y filtros",
    desc: "Filtra por nombre, rol, herramienta o área de enfoque. El resultado se actualiza en tiempo real — sin recargar la página.",
    highlight: "[data-tour='search']",
    color: "220",
    tip: "Escribe un nombre o selecciona un filtro del desplegable",
  },
  {
    icon: "🔔",
    title: "Notificaciones inteligentes",
    desc: "La campana te avisa de bitácoras nuevas, retroalimentación recibida y tareas próximas a vencer — con hasta 2 días de anticipación.",
    highlight: "[data-tour='bell']",
    color: "55",
    tip: "Las alertas de vencimiento se envían 2, 1 y 0 días antes",
  },
  {
    icon: "💬",
    title: "Retroalimentación privada",
    desc: "Los coordinadores pueden dejar comentarios privados en el perfil de cada integrante. Solo el integrante y los coordinadores los ven.",
    color: "295",
  },
  {
    icon: "📋",
    title: "Tareas y seguimiento",
    desc: "Cada persona tiene tareas asignadas con fecha límite y porcentaje de avance. La bitácora semanal se registra desde el propio perfil.",
    color: "27",
  },
  {
    icon: "🚀",
    title: "¡Ya puedes empezar!",
    desc: "Explora el dashboard, haz clic en los perfiles y aprovecha todo al máximo. Puedes repetir este tutorial con el botón ? en cualquier momento.",
    color: "145",
  },
]

const STORAGE_KEY = (email) => `wb_tutorial_done_${email}`
const PAD = 12
const CARD_W = 348

export function Tutorial({ userEmail, forceOpen = false, onClose }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [spotRect, setSpotRect] = useState(null)
  const [animKey, setAnimKey] = useState(0)
  const prevStep = useRef(0)

  useEffect(() => {
    if (forceOpen) { setOpen(true); setStep(0); return }
    if (userEmail && !localStorage.getItem(STORAGE_KEY(userEmail))) setOpen(true)
  }, [forceOpen, userEmail])

  useEffect(() => {
    if (!open) { setSpotRect(null); return }
    const sel = STEPS[step].highlight
    if (!sel) { setSpotRect(null); return }
    const el = document.querySelector(sel)
    if (!el) { setSpotRect(null); return }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
    const t = setTimeout(() => setSpotRect(el.getBoundingClientRect()), 220)
    return () => clearTimeout(t)
  }, [open, step])

  const close = useCallback(() => {
    if (userEmail) localStorage.setItem(STORAGE_KEY(userEmail), "1")
    setOpen(false); setStep(0); setSpotRect(null); onClose?.()
  }, [userEmail, onClose])

  const goTo = (i) => {
    prevStep.current = step
    setStep(i)
    setAnimKey(k => k + 1)
  }
  const next = () => step < STEPS.length - 1 ? goTo(step + 1) : close()
  const prev = () => goTo(Math.max(0, step - 1))

  if (!open) return null

  const cur = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0
  const hue = cur.color || "260"
  const progress = ((step + 1) / STEPS.length) * 100

  // Smart card position: near the highlighted element when possible
  let cardPos = {}
  if (spotRect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = spotRect.left + spotRect.width / 2
    let left = Math.max(16, Math.min(cx - CARD_W / 2, vw - CARD_W - 16))
    const below = vh - (spotRect.bottom + PAD + 16)
    const above = spotRect.top - PAD - 16

    if (below >= 260) {
      cardPos = { position: "fixed", top: spotRect.bottom + PAD + 12, left, zIndex: 54 }
    } else if (above >= 260) {
      cardPos = { position: "fixed", bottom: vh - spotRect.top + PAD + 12, left, zIndex: 54 }
    } else {
      cardPos = { position: "fixed", bottom: 20, right: 20, zIndex: 54 }
    }
  } else {
    cardPos = { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 54 }
  }

  return (
    <>
      <style>{`
        @keyframes wb-tut-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes wb-spot-pulse {
          0%,100% { box-shadow: 0 0 0 0 oklch(0.68 0.20 ${hue} / 0.55), 0 0 0 9999px oklch(0 0 0 / 0.68); }
          50%      { box-shadow: 0 0 0 8px oklch(0.68 0.20 ${hue} / 0),  0 0 0 9999px oklch(0 0 0 / 0.68); }
        }
        @keyframes wb-icon-float {
          0%,100% { transform: translateY(0);   }
          50%      { transform: translateY(-5px); }
        }
        @keyframes wb-shimmer {
          from { background-position: -200% center; }
          to   { background-position:  200% center; }
        }
        .wb-tut-card-wrap { animation: wb-tut-in 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .wb-tut-icon      { animation: wb-icon-float 3s ease-in-out infinite; display:inline-block; }
        .wb-spot {
          transition: left .35s cubic-bezier(.4,0,.2,1), top .35s cubic-bezier(.4,0,.2,1),
                      width .35s cubic-bezier(.4,0,.2,1), height .35s cubic-bezier(.4,0,.2,1);
          animation: wb-spot-pulse 2.2s ease infinite;
        }
      `}</style>

      {/* Transparent catch-all backdrop — always present to block accidental UI interactions */}
      <div onClick={close}
        style={{ position:"fixed", inset:0, zIndex:51, cursor:"default",
          background: spotRect ? "transparent" : "oklch(0 0 0 / 0.65)",
          backdropFilter: spotRect ? "none" : "blur(5px)",
        }} />

      {/* Spotlight div — creates the dark overlay + pulsing hole around target */}
      {spotRect && (
        <div style={{ position:"fixed", inset:0, zIndex:52, pointerEvents:"none" }}>
          <div className="wb-spot" style={{
            position: "absolute",
            left:   spotRect.left  - PAD,
            top:    spotRect.top   - PAD,
            width:  spotRect.width + PAD * 2,
            height: spotRect.height + PAD * 2,
            borderRadius: 14,
          }} />
        </div>
      )}

      {/* Card */}
      <div key={animKey} className="wb-tut-card-wrap" style={{ ...cardPos, width: CARD_W }}>
        <div onClick={e => e.stopPropagation()} style={{
          borderRadius: 20,
          overflow: "hidden",
          background: "var(--card)",
          border: `1px solid oklch(0.60 0.18 ${hue} / 0.35)`,
          boxShadow: `0 28px 64px oklch(0 0 0 / 0.50), 0 0 0 1px oklch(0.60 0.18 ${hue} / 0.12), 0 0 40px oklch(0.60 0.18 ${hue} / 0.08)`,
        }}>

          {/* Gradient header accent */}
          <div style={{
            height: 3,
            background: `linear-gradient(90deg, oklch(0.68 0.22 ${hue}), oklch(0.55 0.26 ${(parseInt(hue)+40)%360}))`,
          }} />

          {/* Progress bar */}
          <div style={{ height: 2, background: "oklch(0.40 0.04 260 / 0.25)" }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: `linear-gradient(90deg, oklch(0.68 0.22 ${hue}), oklch(0.55 0.26 ${(parseInt(hue)+40)%360}))`,
              transition: "width 0.45s cubic-bezier(0.4,0,0.2,1)",
              borderRadius: "0 2px 2px 0",
            }} />
          </div>

          {/* Step dots */}
          <div style={{ display:"flex", justifyContent:"center", gap:6, paddingTop:16, paddingBottom:2 }}>
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => goTo(i)} style={{
                borderRadius:9999, height:6, padding:0, border:"none", cursor:"pointer",
                width: i === step ? 22 : 6,
                transition: "all 0.3s ease",
                background: i === step
                  ? `linear-gradient(90deg, oklch(0.68 0.22 ${hue}), oklch(0.55 0.26 ${(parseInt(hue)+40)%360}))`
                  : i < step
                    ? `oklch(0.60 0.18 ${hue} / 0.45)`
                    : "oklch(0.40 0.04 260 / 0.35)",
              }} title={s.title} />
            ))}
          </div>

          {/* Content */}
          <div style={{ padding:"20px 28px 16px", textAlign:"center" }}>
            <div className="wb-tut-icon" style={{ fontSize:52, lineHeight:1, marginBottom:14, userSelect:"none" }}>
              {cur.icon}
            </div>

            <h2 style={{
              margin:"0 0 10px", fontSize:17, fontWeight:700, lineHeight:1.3, textWrap:"balance",
              color: "var(--foreground)",
            }}>{cur.title}</h2>

            <p style={{
              margin:0, fontSize:13.5, lineHeight:1.7, textWrap:"balance",
              color: "var(--muted-foreground)",
            }}>{cur.desc}</p>

            {/* Tip chip */}
            {cur.tip && (
              <div style={{
                marginTop:12, display:"inline-flex", alignItems:"center", gap:6,
                padding:"5px 12px", borderRadius:99,
                background: `oklch(0.65 0.18 ${hue} / 0.10)`,
                border: `1px solid oklch(0.65 0.18 ${hue} / 0.22)`,
              }}>
                <span style={{ fontSize:11 }}>💡</span>
                <span style={{ fontSize:11.5, fontWeight:600, color:`oklch(0.42 0.16 ${hue})` }}>{cur.tip}</span>
              </div>
            )}

            <p style={{ fontSize:11, color:"oklch(0.50 0.04 260)", marginTop:14, marginBottom:0 }}>
              {step + 1} / {STEPS.length}
            </p>
          </div>

          {/* Buttons */}
          <div style={{ padding:"8px 24px 22px", display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", gap:10 }}>
              {!isFirst && (
                <button onClick={prev} style={{
                  flex:1, height:40, borderRadius:12, cursor:"pointer",
                  border:"1px solid var(--border)", background:"transparent",
                  fontSize:13, fontWeight:600, color:"var(--muted-foreground)",
                  transition:"all 0.2s",
                }}>
                  ← Anterior
                </button>
              )}
              <button onClick={next} style={{
                flex:1, height:40, borderRadius:12, border:"none", cursor:"pointer",
                background: `linear-gradient(135deg, oklch(0.65 0.22 ${hue}), oklch(0.52 0.26 ${(parseInt(hue)+40)%360}))`,
                boxShadow: `0 4px 18px oklch(0.58 0.22 ${hue} / 0.38)`,
                fontSize:13, fontWeight:700, color:"white",
                transition:"opacity 0.2s, transform 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.92"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                {isLast ? "¡Empezar! 🚀" : "Siguiente →"}
              </button>
            </div>
            {!isLast && (
              <button onClick={close} style={{
                background:"none", border:"none", fontSize:12, cursor:"pointer",
                color:"var(--muted-foreground)", padding:"3px 0", opacity:0.7,
              }}>
                Saltar tutorial
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export const resetTutorial = (email) => {
  if (email) localStorage.removeItem(STORAGE_KEY(email))
}
