'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { silentRefresh } from '@/lib/client-auth'

interface Asset {
  id: string
  name: string
  hostname: string
  port: number
  db_type: 'mysql' | 'mongodb'
  max_session_seconds: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { accessToken, role, email, setAuth, clearAuth } = useAuthStore()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null) // which assetId is being requested

  // Restore session if page was refreshed (Zustand was wiped)
  useEffect(() => {
    const init = async () => {
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) {
          router.replace('/login')
          return
        }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }
      fetchAssets(token)
    }
    init()
  }, [])

  const fetchAssets = async (token: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/assets', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        clearAuth()
        router.replace('/login')
        return
      }
      const data = await res.json()
      setAssets(data.assets)
    } catch {
      console.error('Failed to fetch assets')
    } finally {
      setLoading(false)
    }
  }

  const requestAccess = async (assetId: string) => {
    setRequesting(assetId)
    try {
      const res = await fetch('/api/sessions/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ assetId }),
      })

      if (!res.ok) {
        alert('Access denied or policy not found.')
        return
      }

      const { ticket } = await res.json()

      // Calculate terminal dimensions before navigating
      const cols = Math.floor(window.innerWidth / 9)
      const rows = Math.floor((window.innerHeight - 56) / 18) // subtract toolbar height

      // Navigate to terminal — ticket must be used within 60 seconds
      router.push(`/terminal?ticket=${ticket}&cols=${cols}&rows=${rows}`)
    } catch {
      alert('Failed to request access.')
    } finally {
      setRequesting(null)
    }
  }

  const handleLogout = async () => {
    clearAuth()
    // The refreshToken cookie will be cleared when it expires
    // For immediate logout, we'd need a /api/auth/logout endpoint
    router.replace('/login')
  }

  const formatDuration = (seconds: number) => {
    if (seconds >= 3600) return `${seconds / 3600}h`
    return `${seconds / 60}min`
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="font-semibold text-white">SecureGate</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{email}</span>
          <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-300">
            {role}
          </span>
          {(role === 'ADMIN' || role === 'AUDITOR') && (
            <button
              onClick={() => router.push('/replay')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Audit Log
            </button>
          )}
          {role === 'ADMIN' && (
            <button
              onClick={() => router.push('/manage-users')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
             Manage Users
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-zinc-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Target Assets</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Assets your role ({role}) has access to
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            Loading assets…
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-zinc-500">
            No assets configured for your role.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                role={role}
                requesting={requesting === asset.id}
                onRequestAccess={() => requestAccess(asset.id)}
                formatDuration={formatDuration}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Asset Card Component ──────────────────────────────────────────────────────
interface AssetCardProps {
  asset: Asset
  role: string | null
  requesting: boolean
  onRequestAccess: () => void
  formatDuration: (s: number) => string
}

function AssetCard({ asset, role, requesting, onRequestAccess, formatDuration }: AssetCardProps) {
  const isMysql = asset.db_type === 'mysql'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-white">{asset.name}</h2>
          <p className="text-sm text-zinc-400 mt-0.5">{asset.hostname}:{asset.port}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          isMysql
            ? 'bg-blue-900 text-blue-300'
            : 'bg-green-900 text-green-300'
        }`}>
          {asset.db_type.toUpperCase()}
        </span>
      </div>

      {/* Session time */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Max session: {formatDuration(asset.max_session_seconds)}
      </div>

      {/* Button — AUDITOR cannot request sessions */}
      {role !== 'AUDITOR' ? (
        <button
          onClick={onRequestAccess}
          disabled={requesting}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {requesting ? 'Requesting…' : 'Request Access'}
        </button>
      ) : (
        <div className="w-full rounded-lg border border-zinc-700 py-2 text-center text-sm text-zinc-500">
          View Only (Auditor)
        </div>
      )}
    </div>
  )
}