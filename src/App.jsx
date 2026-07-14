import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import LotList from './pages/LotList'
import OwnerList from './pages/OwnerList'
import LotDetail from './pages/LotDetail'
import OwnerDetail from './pages/OwnerDetail'
import RoomDetail from './pages/RoomDetail'
import StatementDetail from './pages/StatementDetail'
import StatementPrint from './pages/StatementPrint'
import Reports from './pages/Reports'
import GenerateStatements from './pages/GenerateStatements'
import Setup from './pages/Setup'
import ImportRevenue from './pages/ImportRevenue'
import SchemaViewer from './pages/SchemaViewer'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/lots" replace />} />
          <Route path="/lots" element={<LotList />} />
          <Route path="/owners" element={<OwnerList />} />
          <Route path="/lots/:lotId" element={<LotDetail />} />
          <Route path="/lots/:lotId/owners/:ownerId" element={<OwnerDetail />} />
          <Route path="/lots/:lotId/rooms/:roomId" element={<RoomDetail />} />
          <Route path="/lots/:lotId/statements/:statementId" element={<StatementDetail />} />
          <Route path="/lots/:lotId/statements/:statementId/print" element={<StatementPrint />} />
          <Route path="/statements/generate" element={<GenerateStatements />} />
          <Route path="/statements" element={<GenerateStatements />} />
          <Route path="/reports/:type" element={<Reports />} />
          <Route path="/setup/expense-types" element={<Setup />} />
          <Route path="/setup/import-revenue" element={<ImportRevenue />} />
          <Route path="/schema" element={<SchemaViewer />} />
        </Routes>
      </Layout>
    </Router>
  )
}
