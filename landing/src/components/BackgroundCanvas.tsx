import { useEffect, useRef } from 'react'

/**
 * BackgroundCanvas — Precision Industrial Perspective Telemetry Grid
 * Features a scroll-driven coordinate grid with perspective lines,
 * depth markers, and subtle telemetry nodes. Replaces generic AI blur orbs
 * with a high-performance, responsive canvas animation.
 */
export default function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // In headless test environments (e.g. jsdom in Vitest), bail out early
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

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    const handleScroll = () => {
      targetScrollY = window.scrollY || 0
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, { passive: true })

    let tick = 0

    const render = () => {
      tick += 0.005

      // Smooth scroll interpolation
      scrollY += (targetScrollY - scrollY) * 0.08

      ctx.clearRect(0, 0, width, height)

      // 1. Subtle Radial Vignette Gradient
      const radialGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        50,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      )
      radialGrad.addColorStop(0, 'rgba(15, 17, 43, 0.45)')
      radialGrad.addColorStop(0.5, 'rgba(10, 11, 26, 0.75)')
      radialGrad.addColorStop(1, 'rgba(7, 8, 20, 0.95)')
      ctx.fillStyle = radialGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Horizon & Perspective Matrix Lines
      const horizonY = height * 0.42
      const scrollOffset = (scrollY * 0.35) % 60
      const vpX = width * 0.5

      ctx.lineWidth = 1

      // Radiating perspective lines from vanishing point
      const numRays = Math.floor(width / 70)
      for (let i = -numRays; i <= numRays; i++) {
        const bottomX = vpX + i * 90 + ((i * scrollY * 0.02) % 40)
        const alpha = Math.max(0.015, 0.07 - Math.abs(i) / (numRays * 1.5))
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`

        ctx.beginPath()
        ctx.moveTo(vpX, horizonY)
        ctx.lineTo(bottomX, height)
        ctx.stroke()
      }

      // Horizontal perspective cross-beams (exponential spacing toward bottom)
      const numPlanes = 16
      for (let j = 1; j <= numPlanes; j++) {
        const progress = (j + scrollOffset / 60) / numPlanes
        if (progress <= 0 || progress > 1) continue

        const py = horizonY + Math.pow(progress, 2.2) * (height - horizonY)
        const alpha = progress * 0.075

        ctx.strokeStyle = `rgba(129, 140, 248, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(0, py)
        ctx.lineTo(width, py)
        ctx.stroke()
      }

      // 3. Orthogonal Top Telemetry Grid (Header & Sky Region)
      const topGridSpacing = 80
      const topAlpha = 0.025
      ctx.strokeStyle = `rgba(255, 255, 255, ${topAlpha})`

      const topShiftY = (scrollY * 0.15) % topGridSpacing
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

        // Subtle crosshair ticks at top grid intersections
        for (let y = topShiftY; y < horizonY; y += topGridSpacing) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)'
          ctx.beginPath()
          ctx.moveTo(x - 3, y)
          ctx.lineTo(x + 3, y)
          ctx.moveTo(x, y - 3)
          ctx.lineTo(x, y + 3)
          ctx.stroke()
          ctx.strokeStyle = `rgba(255, 255, 255, ${topAlpha})`
        }
      }

      // 4. Subtle telemetry sweep line
      if (!prefersReducedMotion) {
        const sweepProgress = (tick * 0.8) % 1
        const sweepY = horizonY + sweepProgress * (height - horizonY)
        const sweepGrad = ctx.createLinearGradient(0, sweepY, width, sweepY)
        sweepGrad.addColorStop(0, 'rgba(16, 185, 129, 0)')
        sweepGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.05)')
        sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0)')

        ctx.strokeStyle = sweepGrad
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, sweepY)
        ctx.lineTo(width, sweepY)
        ctx.stroke()
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
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
