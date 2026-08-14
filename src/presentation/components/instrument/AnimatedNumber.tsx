import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect } from 'react'

interface AnimatedNumberProps {
  value: number
  format: (value: number) => string
  duration?: number
  delay?: number
}

/**
 * Figuras financeiras assentando, como um totalizador mecânico parando.
 * Com `prefers-reduced-motion` o valor final aparece direto.
 */
export default function AnimatedNumber({
  value,
  format,
  duration = 1.05,
  delay = 0,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const progress = useMotionValue(reduce ? value : 0)
  const text = useTransform(progress, (current) => format(current))

  useEffect(() => {
    if (reduce) {
      progress.set(value)
      return
    }
    const controls = animate(progress, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => controls.stop()
  }, [value, reduce, progress, duration, delay])

  return <motion.span>{text}</motion.span>
}
