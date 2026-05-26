import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUIStore } from './stores'
import AppShell from './components/AppShell'
import TodayRoute from './routes/today'
import PlanRoute from './routes/plan'
import TrendsRoute from './routes/trends'
import CoachRoute from './routes/coach'
import SettingsRoute from './routes/settings'

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayRoute />} />
          <Route path="/plan" element={<PlanRoute />} />
          <Route path="/trends" element={<TrendsRoute />} />
          <Route path="/coach" element={<CoachRoute />} />
          <Route path="/coach/:threadId" element={<CoachRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
