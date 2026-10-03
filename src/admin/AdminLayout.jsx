import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Wordmark'
import { api } from './api'
import { Spinner, ToastProvider } from './ui'

export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

const NAV = [
  { to: '/admin', label: 'Products', end: true },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/account', label: 'Account' },
]

export function Component() {
  useNoIndex()
  const navigate = useNavigate()
  const location = useLocation()
  const [admin, setAdmin] = useState(null)

  const goToLogin = useCallback(
    () => navigate('/admin/login', { replace: true, state: { from: location.pathname } }),
    [navigate, location.pathname],
  )

  useEffect(() => {
    let active = true
    api
      .me()
      .then((me) => active && (me?.email ? setAdmin(me) : goToLogin()))
      .catch(() => active && goToLogin())
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.addEventListener('snug:auth-expired', goToLogin)
    return () => window.removeEventListener('snug:auth-expired', goToLogin)
  }, [goToLogin])

  const signOut = async () => {
    await api.logout().catch(() => {})
    navigate('/admin/login', { replace: true })
  }

  if (!admin) {
    return (
      <div className="shell">
        <Spinner label="Checking your sign-in…" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="min-h-svh bg-paper">
        <header className="border-b border-line">
          <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <div className="flex items-baseline gap-3">
              <Link to="/admin" className="text-[1.375rem]" aria-label="Snug & Co. admin home">
                <Wordmark />
              </Link>
              <span className="text-sm text-stone">Admin</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/" target="_blank" rel="noopener noreferrer" className="link">
                View site
              </Link>
              <span className="hidden text-stone sm:inline">{admin.email}</span>
              <button type="button" onClick={signOut} className="link">
                Sign out
              </button>
            </div>
          </div>
          <nav aria-label="Admin" className="shell no-scrollbar flex gap-1 overflow-x-auto pb-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `chip shrink-0 ${isActive ? 'border-ink bg-ink text-paper' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="shell pb-32 pt-8 lg:pt-10">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  )
}
