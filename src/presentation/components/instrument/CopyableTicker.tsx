import { useEffect, useRef, useState } from 'react'

interface CopyableTickerProps {
  ticker: string
}

/**
 * Nome do ativo clicável: copia o ticker para a área de transferência e avisa
 * com um "· copiado" breve.
 *
 * Vive dentro de botões/links de linha (ranking, busca, histórico), então o
 * clique para de propagar para não acionar o toggle ou a navegação do pai.
 */
export default function CopyableTicker({ ticker }: CopyableTickerProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <strong
      className={`ticker is-copyable${copied ? ' is-copied' : ''}`}
      title={`Copiar ${ticker}`}
      onClick={(event) => {
        event.stopPropagation()
        if (copied) return
        void navigator.clipboard
          .writeText(ticker)
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
      {ticker}
      {copied && <small className="copied-note">· copiado</small>}
    </strong>
  )
}