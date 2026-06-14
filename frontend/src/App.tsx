import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUIStore } from './stores'
import AppShell from './components/AppShell'
import TodayRoute from './routes/today'
import MealsRoute from './routes/meals'
import TrendsRoute from './routes/trends'
import CoachRoute from './routes/coach'
import SettingsRoute from './routes/settings'
import LogRoute from './routes/log'
import FavoritesRoute from './routes/favorites'
import FamilyRoute from './routes/family'
import HealthRoute from './routes/health'
import { OfflineBanner, InstallPrompt } from './components/PwaPrompts'

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    function selectOnFocus(e: FocusEvent) {
      const t = e.target
      if (t instanceof HTMLInputElement && t.type === 'number') t.select()
    }
    document.addEventListener('focus', selectOnFocus, true)
    return () => document.removeEventListener('focus', selectOnFocus, true)
  }, [])

  return (
    <BrowserRouter>
      <OfflineBanner/>
      <InstallPrompt/>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayRoute />} />
          <Route path="/meals" element={<MealsRoute />} />
          <Route path="/trends" element={<TrendsRoute />} />
          <Route path="/coach" element={<CoachRoute />} />
          <Route path="/coach/:threadId" element={<CoachRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/log" element={<LogRoute />} />
          <Route path="/favorites" element={<FavoritesRoute />} />
          <Route path="/family" element={<FamilyRoute />} />
          <Route path="/health" element={<HealthRoute />} />
          <Route path="/insights" element={<Navigate to="/coach?tab=insights" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
