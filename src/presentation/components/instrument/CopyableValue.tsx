import { useEffect, useRef, useState, type ReactNode } from 'react'

interface CopyableValueProps {
  children: ReactNode
  /** Rótulo usado no tooltip ("Copiar Liquidez diária"). */
  label: string
  /** Classes extras para o `<dd>` (is-value, positive, negative, …). */
  className?: string
}

/**
 * Valor de uma célula de detalhe clicável: copia o número exibido para a área
 * de transferência e avisa com um "· copiado" breve.
 *
 * Extrai do `textContent` do `<dd>` apenas o número ("R$ 0,10" → "0,10");
 * células sem número (nome da empresa) copiam o texto como está.
 */
export default function CopyableValue({ children, label, className }: CopyableValueProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <dd
      ref={ref}
      className={className == null ? 'is-copyable' : `is-copyable ${className}`}
      title={`Copiar ${label}`}
      onClick={(event) => {
        event.stopPropagation()
        if (copied || ref.current == null) return
        const raw = ref.current.textContent?.trim() ?? ''
        if (raw === '') return
        // Copia só o número: "R$ 0,10" vira "0,10", "26,78%" vira "26,78",
        // "1º" vira "1". Sem número no texto (nome da empresa, "—"), copia o
        // texto como está — e quando há dois números (ex. "6,57% de 366,8%"),
        // fica com o primeiro, que é o valor principal da célula.
        const numeric = raw.match(/-?\d[\d.,]*/)
        const text = numeric?.[0] ?? raw
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            if (timer.current != null) window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setCopied(false), 1600)
          })
          .catch(() => {
            // Sem permissão de clipboard (http fora de localhost, etc.): o clique
            // simplesmente não copia; o aviso do navegador já explica o motivo.
          })
      }}
    >
      {children}
      {copied && <small className="copied-note">· copiado</small>}
    </dd>
  )
}