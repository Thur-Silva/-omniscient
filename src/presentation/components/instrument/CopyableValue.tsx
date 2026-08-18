import { useEffect, useRef, useState, type ReactNode } from 'react'

interface CopyableValueProps {
  children: ReactNode
  /** Rótulo usado no tooltip ("Copiar Liquidez diária"). */
  label: string
  /** Classes extras para o `<dd>` (is-value, positive, negative, …). */
  className?: string
}

/**
 * Valor de uma célula de detalhe clicável: copia o texto exibido para a área de
 * transferência e avisa com um "· copiado" breve.
 *
 * Copia o `textContent` do próprio `<dd>`, então qualquer formatação do filho
 * (moeda, percentual, sub-anotações em `<small>`) sai junto, sem duplicar
 * regra de formatação aqui.
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
        const text = ref.current.textContent?.trim() ?? ''
        if (text === '') return
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