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
import RecipesRoute from './routes/recipes'
import { OfflineBanner, InstallPrompt } from './components/PwaPrompts'

export default function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <BrowserRouter>
      <OfflineBanner/>
      <InstallPrompt/>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayRoute />} />
          <Route path="/meals" element={<MealsRoute />} />
          <Route path="/foods" element={<Navigate to="/meals" replace />} />
          <Route path="/plan" element={<Navigate to="/meals?tab=plan" replace />} />
          <Route path="/trends" element={<TrendsRoute />} />
          <Route path="/coach" element={<CoachRoute />} />
          <Route path="/coach/:threadId" element={<CoachRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/log" element={<LogRoute />} />
          <Route path="/recipes" element={<RecipesRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
