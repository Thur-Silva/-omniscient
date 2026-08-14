import AppRoutes from './presentation/routes/AppRoutes'

// O BrowserRouter fica em ClerkAppProvider, porque o ClerkProvider precisa do
// useNavigate do React Router.
function App() {
  return <AppRoutes />
}

export default App
