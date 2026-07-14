import { NavLink, useLocation } from 'react-router-dom'

function IconLot() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm4 0h2v2h-2V5zm-4 4h2v2H7V9zm4 0h2v2h-2V9zm-4 4h2v2H7v-2zm4 0h2v2h-2v-2z" clipRule="evenodd" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  )
}

function IconDatabase() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
      <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
      <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
    </svg>
  )
}

const groups = [
  {
    label: 'Lot & Owner Maintenance',
    Icon: IconLot,
    items: [
      { label: 'Lot Information',        to: '/lots' },
      { label: 'Owner Information',      to: '/owners' },
      { label: 'Lot & Room Info',        to: '/lots?view=rooms' },
      { label: 'Generate Statements',    to: '/statements/generate' }
    ]
  },
  {
    label: 'Reports',
    Icon: IconChart,
    items: [
      { label: 'General Revenue – By Stay Date', to: '/reports/general-revenue' },
      { label: 'Invoice Details by Activity',  to: '/reports/invoice-details' },
      { label: 'Trans Code 1032 Adjustments',  to: '/reports/trans-code-1032' },
      { label: 'Audit Data – By Stay Date',    to: '/reports/audit-data' }
    ]
  },
  {
    label: 'Setup & Maintenance',
    Icon: IconGear,
    items: [
      { label: 'Owner Expense Types',    to: '/setup/expense-types' },
      { label: 'Import General Revenue', to: '/setup/import-revenue' }
    ]
  },
  {
    label: 'Admin',
    Icon: IconDatabase,
    items: [
      { label: 'Database Schema Browser', to: '/schema' }
    ]
  }
]

// Exact match on both pathname AND query string so items sharing the same
// base path (e.g. /lots, /lots?view=owners, /lots?view=rooms) highlight independently.
function isItemActive(item, location) {
  const [path, qs] = item.to.split('?')
  if (location.pathname !== path) return false
  if (!qs) return location.search === ''
  return location.search === `?${qs}`
}

export default function Layout({ children }) {
  const location = useLocation()

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="bg-navy-900 text-white flex items-center px-4 h-12 flex-shrink-0 shadow z-10">
        <span className="font-bold text-base tracking-wide mr-2 text-blue-400">GGRC</span>
        <span className="text-gray-400 text-xs font-medium">Garden of the Gods Resort — Casita Invoices</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <nav className="w-60 flex-shrink-0 overflow-y-auto" style={{ backgroundColor: '#152a50' }}>
          <div className="py-3 space-y-1">
            {groups.map((group) => {
              const isGroupActive = group.items.some(item => isItemActive(item, location))

              return (
                <div key={group.label}>
                  {/* Parent row */}
                  <div className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-md ${isGroupActive ? 'bg-white/10' : ''}`}>
                    <span className={`flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 ${isGroupActive ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-400'}`}>
                      <group.Icon />
                    </span>
                    <span className={`text-xs font-semibold uppercase tracking-wide leading-tight ${isGroupActive ? 'text-white' : 'text-gray-400'}`}>
                      {group.label}
                    </span>
                  </div>

                  {/* Sub-items */}
                  <ul className="mt-0.5 mb-1">
                    {group.items.map((item) => {
                      const active = isItemActive(item, location)
                      return (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            className={`flex items-center gap-2 pl-12 pr-3 py-1.5 mx-2 rounded-md text-sm transition-colors ${
                              active
                                ? 'bg-blue-600 text-white font-medium'
                                : 'text-gray-400 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-white' : 'bg-gray-500'}`} />
                            {item.label}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>

                  {/* Divider between groups */}
                  <div className="mx-4 border-t border-white/5" />
                </div>
              )
            })}
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
