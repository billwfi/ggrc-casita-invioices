import { NavLink, useNavigate } from 'react-router-dom'

const groups = [
  {
    title: 'Lot and Owner Maintenance',
    items: [
      { label: 'Lot Information', to: '/lots' },
      { label: 'Owner Information', to: '/lots?view=owners' },
      { label: 'Lot and Associated Room Info', to: '/lots?view=rooms' }
    ]
  },
  {
    title: 'Reports',
    items: [
      { label: 'Lot Invoice Details by Activity Dates', to: '/reports/invoice-details' },
      { label: 'Trans Code 1032 Adjustments', to: '/reports/trans-code-1032' },
      { label: 'Lot Invoice Audit Data – By Stay Date', to: '/reports/audit-data' }
    ]
  },
  {
    title: 'Setup Maintenance',
    items: [
      { label: 'Owner Expense Type Management', to: '/setup/expense-types' },
      { label: 'Import General Revenue', to: '/setup/import-revenue' }
    ]
  },
  {
    title: 'Admin',
    items: [
      { label: 'Database Schema Browser', to: '/schema' }
    ]
  }
]

export default function Layout({ children }) {
  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="bg-navy-700 text-white flex items-center px-4 h-12 flex-shrink-0 shadow">
        <span className="font-bold text-base tracking-wide mr-3">GGRC</span>
        <span className="text-gray-300 text-sm">Garden of the Gods Resort, Wellness &amp; Club — Casita Invoices</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <nav className="w-56 flex-shrink-0 bg-navy-700 overflow-y-auto">
          <div className="py-3 space-y-4">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-blue-300 select-none">
                  {group.title}
                </div>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `nav-link ${isActive ? 'nav-link-active' : ''}`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
