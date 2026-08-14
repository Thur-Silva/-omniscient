/** Tela de diagnóstico para quando VITE_CLERK_PUBLISHABLE_KEY não está definida. */
export default function MissingClerkKey() {
  return (
    <div className="centered-shell">
      <section className="card auth-card">
        <h1>Configuração do Clerk pendente</h1>
        <p className="muted">
          A variável <code>VITE_CLERK_PUBLISHABLE_KEY</code> não está definida, então a autenticação
          não pode iniciar.
        </p>
        <ol className="setup-steps">
          <li>
            Copie o template: <code>cp .env.example .env</code>
          </li>
          <li>
            Pegue a chave publicável em{' '}
            <a href="https://dashboard.clerk.com/~/api-keys" target="_blank" rel="noreferrer">
              dashboard.clerk.com
            </a>{' '}
            (começa com <code>pk_test_</code>)
          </li>
          <li>
            Preencha <code>VITE_CLERK_PUBLISHABLE_KEY</code> no <code>.env</code>
          </li>
          <li>Reinicie o servidor de desenvolvimento</li>
        </ol>
      </section>
    </div>
  )
}
