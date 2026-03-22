import { Routes, Route } from 'react-router-dom'
import Home      from './pages/Home'
import Exam      from './pages/Exam'
import History   from './pages/History'
import Analytics from './pages/Analytics'
import Review    from './pages/Review'

export default function App() {
  return (
    <Routes>
      <Route path="/"                       element={<Home />} />
      <Route path="/exam/:examId"           element={<Exam />} />
      <Route path="/history"                element={<History />} />
      <Route path="/review/:attemptId"      element={<Review />} />
      <Route path="/analytics"              element={<Analytics />} />
    </Routes>
  )
}
