import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Markets from './pages/Markets'
import OptimizerVaults from './pages/OptimizerVaults'
import RiskModules from './pages/RiskModules'
import Faucet from './pages/Faucet'
import P2PMarket from './pages/P2PMarket'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{ className: 'dark:bg-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700' }} />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="markets" element={<Markets />} />
          <Route path="optimizer" element={<OptimizerVaults />} />
          <Route path="risk" element={<RiskModules />} />
          <Route path="faucet" element={<Faucet />} />
          <Route path="p2p" element={<P2PMarket />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
