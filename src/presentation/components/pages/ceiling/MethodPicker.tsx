import {
  CEILING_METHODS,
  CEILING_METHOD_IDS,
  FAMILY_LABELS,
  type CeilingMethodId,
} from '../../../../domain/valuation/methods'
import type { MethodSelection } from '../../../../domain/stock/method-selection'

interface MethodPickerProps {
  method: CeilingMethodId
  selection: MethodSelection
  overridden: boolean
  onSelect: (method: CeilingMethodId) => void
}

/**
 * Qual régua está avaliando este ativo, e a troca.
 *
 * A informação vem antes da escolha de propósito: o número no topo da tela só quer
 * dizer algo se estiver claro qual modelo o produziu e por que aquele modelo se
 * aplica a esta empresa. Trocar é permitido — cada método tem o que vê e o que não
 * vê, e comparar duas réguas no mesmo ativo é leitura legítima —, mas a troca fica
 * marcada, para não passar por recomendação do sistema.
 */
export default function MethodPicker({
  method,
  selection,
  overridden,
  onSelect,
}: MethodPickerProps) {
  const descriptor = CEILING_METHODS[method]
  const recommended = CEILING_METHODS[selection.recommended]

  return (
    <section className="method-panel">
      <div className="section-head">
        <h2 className="section-title">Método</h2>
        <span className="section-count">
          {FAMILY_LABELS[selection.family]}
          {selection.adjustedByBehavior ? ' · por comportamento' : ' · por setor'}
        </span>
      </div>

      <div className="chips" role="group" aria-label="Método de preço teto">
        {CEILING_METHOD_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={method === id}
            className={`chip${method === id ? ' is-active' : ''}${
              id === selection.recommended ? ' is-recommended' : ''
            }`}
            onClick={() => onSelect(id)}
            title={CEILING_METHODS[id].label}
          >
            {CEILING_METHODS[id].short}
          </button>
        ))}
      </div>

      <div className="method-note">
        <span className="eyebrow">
          {descriptor.label}
          {method === selection.recommended ? ' · recomendado para este ativo' : ''}
        </span>
        <p className="method-formula">{descriptor.formula}</p>
        <p>
          <b>Desconta:</b> {descriptor.flow}
        </p>
        <p>{selection.reason}</p>
        <p>
          <b>Serve para:</b> {descriptor.fits}
        </p>
        <p className="method-limits">
          <b>Onde erra:</b> {descriptor.limits}
        </p>
        {overridden && (
          <p className="method-fallback">
            Você trocou a régua. O recomendado para este ativo é {recommended.label}; o número
            acima sai de {descriptor.label}.
          </p>
        )}
        <p className="method-source">{descriptor.source}</p>
      </div>
    </section>
  )
}
