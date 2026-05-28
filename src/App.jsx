import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LotList from './pages/LotList'
import LotDetail from './pages/LotDetail'
import OwnerDetail from './pages/OwnerDetail'
import RoomDetail from './pages/RoomDetail'
import StatementDetail from './pages/StatementDetail'
import Reports from './pages/Reports'
import Setup from './pages/Setup'
import SchemaViewer from './pages/SchemaViewer'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/lots" replace />} />
          <Route path="/lots" element={<LotList />} />
          <Route path="/lots/:lotId" element={<LotDetail />} />
          <Route path="/lots/:lotId/owners/:ownerId" element={<OwnerDetail />} />
          <Route path="/lots/:lotId/rooms/:roomId" element={<RoomDetail />} />
          <Route path="/lots/:lotId/statements/:statementId" element={<StatementDetail />} />
          <Route path="/reports/:type" element={<Reports />} />
          <Route path="/setup/expense-types" element={<Setup />} />
          <Route path="/schema" element={<SchemaViewer />} />
        </Routes>
      </Layout>
    </Router>
  )
}
