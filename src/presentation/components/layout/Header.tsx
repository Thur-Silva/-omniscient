export default function Header() {
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header className="header">
      <h1 className="header-title">Visão geral da carteira</h1>
      <span className="header-date">{today}</span>
    </header>
  )
}
