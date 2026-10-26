import { useEffect, useRef } from 'react'

/**
 * BackgroundCanvas — Continuous 60FPS Industrial Telemetry Matrix
 * 
 * Features:
 * 1. Continuous forward perspective fly-through loop (never static, even when idle)
 * 2. Active data packets traveling along coordinate grid lines
 * 3. Pulsing radar beacons & coordinate intersections
 * 4. Interactive cursor proximity illumination
 * 5. Headless test environment bypass for Vitest/jsdom
 */
export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Bail out early in headless test environments (Vitest / jsdom)
    if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    let scrollY = window.scrollY || 0
    let targetScrollY = scrollY

    let mouseX = width * 0.5
    let mouseY = height * 0.4
    let targetMouseX = mouseX
    let targetMouseY = mouseY

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    const handleScroll = () => {
      targetScrollY = window.scrollY || 0
    }

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX
      targetMouseY = e.clientY
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    // Packet particle pool for active line data flow
    const packets = Array.from({ length: 18 }, () => ({
      rayIndex: Math.floor(Math.random() * 24) - 12,
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.005,
      color: Math.random() > 0.4 ? 'rgba(245, 158, 11, ' : 'rgba(6, 182, 212, ',
    }))

    let tick = 0

    const render = () => {
      tick += 0.008

      // Smooth camera interpolation
      scrollY += (targetScrollY - scrollY) * 0.08
      mouseX += (targetMouseX - mouseX) * 0.05
      mouseY += (targetMouseY - mouseY) * 0.05

      ctx.clearRect(0, 0, width, height)

      // Check active theme (Dark Obsidian vs Light Blueprint)
      const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-light')

      // 1. Base Gradient
      const baseGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        40,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      )
      if (isLight) {
        baseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)')
        baseGrad.addColorStop(0.5, 'rgba(248, 250, 252, 0.98)')
        baseGrad.addColorStop(1, 'rgba(241, 245, 249, 1.0)')
      } else {
        baseGrad.addColorStop(0, 'rgba(16, 20, 28, 0.75)')
        baseGrad.addColorStop(0.5, 'rgba(11, 13, 18, 0.92)')
        baseGrad.addColorStop(1, 'rgba(7, 8, 11, 0.98)')
      }
      ctx.fillStyle = baseGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Horizon & Perspective Matrix Coordinates
      const horizonY = height * 0.38 + Math.sin(tick * 0.4) * 4
      const vpX = width * 0.5 + (mouseX - width * 0.5) * 0.03
      const numRays = Math.max(12, Math.floor(width / 65))

      ctx.lineWidth = 1

      // Radiating perspective lines with continuous wave motion
      for (let i = -numRays; i <= numRays; i++) {
        const bottomBaseX = vpX + i * 85
        const rayShift = Math.sin(tick * 0.6 + i * 0.2) * 10
        const bottomX = bottomBaseX + rayShift
        const distFromCenter = Math.abs(i) / numRays
        const alpha = Math.max(0.015, (0.09 - distFromCenter * 0.07))

        // Amber toward center, cyan/slate toward edges
        if (Math.abs(i) <= 2) {
          ctx.strokeStyle = isLight
            ? `rgba(217, 119, 6, ${alpha * 2.2})`
            : `rgba(245, 158, 11, ${alpha * 1.5})`
        } else {
          ctx.strokeStyle = isLight
            ? `rgba(71, 85, 105, ${alpha * 1.6})`
            : `rgba(148, 163, 184, ${alpha})`
        }

        ctx.beginPath()
        ctx.moveTo(vpX, horizonY)
        ctx.lineTo(bottomX, height)
        ctx.stroke()
      }

      // Continuous forward-moving transverse grid beams
      const numPlanes = 14
      const continuousOffset = prefersReducedMotion ? 0 : (tick * 0.4) % 1
      const scrollOffset = (scrollY * 0.003) % 1

      for (let j = 1; j <= numPlanes; j++) {
        const normalized = ((j + continuousOffset + scrollOffset) % numPlanes) / numPlanes
        if (normalized <= 0.05 || normalized >= 0.98) continue

        const py = horizonY + Math.pow(normalized, 2.4) * (height - horizonY)
        const alpha = normalized * 0.09

        // Highlight every 3rd line with subtle amber pulse
        const isPulseLine = j % 3 === 0
        if (isPulseLine) {
          ctx.strokeStyle = isLight
            ? `rgba(217, 119, 6, ${alpha * 2.0})`
            : `rgba(245, 158, 11, ${alpha * 1.4})`
        } else {
          ctx.strokeStyle = isLight
            ? `rgba(100, 116, 139, ${alpha * 1.5})`
            : `rgba(100, 116, 139, ${alpha})`
        }

        ctx.beginPath()
        ctx.moveTo(0, py)
        ctx.lineTo(width, py)
        ctx.stroke()
      }

      // 3. Active Data Packets (Traveling along the ground grid)
      if (!prefersReducedMotion) {
        for (const p of packets) {
          p.progress += p.speed
          if (p.progress > 1) {
            p.progress = 0.05
            p.rayIndex = Math.floor(Math.random() * (numRays * 2)) - numRays
          }

          const py = horizonY + Math.pow(p.progress, 2.4) * (height - horizonY)
          const px = vpX + p.rayIndex * 85 * Math.pow(p.progress, 1.2)
          const alpha = p.progress * (1 - p.progress * 0.5)

          const packetColor = isLight
            ? (p.color.includes('245') ? 'rgba(217, 119, 6, ' : 'rgba(2, 132, 199, ')
            : p.color

          ctx.fillStyle = `${packetColor}${alpha * 0.85})`
          ctx.beginPath()
          ctx.arc(px, py, 2.5 * p.progress, 0, Math.PI * 2)
          ctx.fill()

          // Subtle packet glow tail
          ctx.strokeStyle = `${packetColor}${alpha * 0.3})`
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px, py - 8 * p.progress)
          ctx.stroke()
        }
      }

      // 4. Orthogonal Top Telemetry Matrix (Header Region)
      const topGridSpacing = 72
      const topAlpha = isLight ? 0.045 : 0.025
      ctx.strokeStyle = isLight
        ? `rgba(15, 23, 42, ${topAlpha})`
        : `rgba(255, 255, 255, ${topAlpha})`

      const topShiftY = (tick * 4) % topGridSpacing
      for (let y = topShiftY; y < horizonY; y += topGridSpacing) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      for (let x = 0; x < width; x += topGridSpacing) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, horizonY)
        ctx.stroke()

        // Subtle crosshair ticks
        for (let y = topShiftY; y < horizonY; y += topGridSpacing) {
          ctx.strokeStyle = isLight
            ? 'rgba(217, 119, 6, 0.15)'
            : 'rgba(245, 158, 11, 0.08)'
          ctx.beginPath()
          ctx.moveTo(x - 3, y)
          ctx.lineTo(x + 3, y)
          ctx.moveTo(x, y - 3)
          ctx.lineTo(x, y + 3)
          ctx.stroke()
          ctx.strokeStyle = isLight
            ? `rgba(15, 23, 42, ${topAlpha})`
            : `rgba(255, 255, 255, ${topAlpha})`
        }
      }

      // 5. Continuous Scanning Laser / Radar Beam
      if (!prefersReducedMotion) {
        const sweepProgress = (tick * 0.25) % 1
        const sweepY = horizonY + sweepProgress * (height - horizonY)
        const sweepGrad = ctx.createLinearGradient(0, sweepY, width, sweepY)
        if (isLight) {
          sweepGrad.addColorStop(0, 'rgba(217, 119, 6, 0)')
          sweepGrad.addColorStop(0.3, 'rgba(217, 119, 6, 0.15)')
          sweepGrad.addColorStop(0.5, 'rgba(2, 132, 199, 0.2)')
          sweepGrad.addColorStop(0.7, 'rgba(217, 119, 6, 0.15)')
          sweepGrad.addColorStop(1, 'rgba(217, 119, 6, 0)')
        } else {
          sweepGrad.addColorStop(0, 'rgba(245, 158, 11, 0)')
          sweepGrad.addColorStop(0.3, 'rgba(245, 158, 11, 0.08)')
          sweepGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.12)')
          sweepGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.08)')
          sweepGrad.addColorStop(1, 'rgba(245, 158, 11, 0)')
        }

        ctx.strokeStyle = sweepGrad
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, sweepY)
        ctx.lineTo(width, sweepY)
        ctx.stroke()

        // Radar node on cursor
        const distFromCenter = Math.hypot(mouseX - width * 0.5, mouseY - horizonY)
        if (distFromCenter < 350) {
          ctx.strokeStyle = isLight ? 'rgba(217, 119, 6, 0.25)' : 'rgba(245, 158, 11, 0.15)'
          ctx.beginPath()
          ctx.arc(mouseX, mouseY, 30 + Math.sin(tick * 3) * 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  )
}
