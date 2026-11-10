import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n'

// Pages
import Onboarding from './pages/onboarding/Onboarding'
import Login from './pages/onboarding/Login'
import Home from './pages/Home'
import History from './pages/History'
import Settings from './pages/Settings'
import ExportScreen from './pages/ExportScreen'
import ContractorPage from './pages/contractor/ContractorPage'
import ContractorThanks from './pages/contractor/ContractorThanks'

function App() {
  const [worker, setWorker] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      const savedWorker = localStorage.getItem('saakshi_worker')
      if (savedWorker) {
        setWorker(JSON.parse(savedWorker))
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={worker ? <Navigate to="/home" /> : <Onboarding onLogin={(w) => { setWorker(w); localStorage.setItem('saakshi_worker', JSON.stringify(w)) }} />}
          />
          <Route
            path="/login"
            element={<Login onLogin={(w) => { setWorker(w); localStorage.setItem('saakshi_worker', JSON.stringify(w)) }} />}
          />
          <Route
            path="/home"
            element={worker ? <Home worker={worker} /> : <Navigate to="/" />}
          />
          <Route
            path="/history"
            element={worker ? <History worker={worker} /> : <Navigate to="/" />}
          />
          <Route
            path="/settings"
            element={worker ? <Settings worker={worker} /> : <Navigate to="/" />}
          />
          <Route
            path="/export"
            element={worker ? <ExportScreen /> : <Navigate to="/" />}
          />
          <Route
            path="/c/:token"
            element={<ContractorPage />}
          />
          <Route
            path="/contractor/thanks"
            element={<ContractorThanks />}
          />
        </Routes>
      </BrowserRouter>
    </I18nextProvider>
  )
}

export default App
