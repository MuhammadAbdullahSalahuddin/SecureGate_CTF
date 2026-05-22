'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { silentRefresh } from '@/lib/client-auth'

interface User {
  id: string
  email: string
  role: string
  created_at: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { accessToken, role, setAuth, clearAuth } = useAuthStore()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Create user form state
  const [showForm, setShowForm] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<'ADMIN' | 'OPERATOR' | 'AUDITOR'>('OPERATOR')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      let token = accessToken
      if (!token) {
        const refreshed = await silentRefresh()
        if (!refreshed) { router.replace('/login'); return }
        setAuth(refreshed.accessToken, refreshed.role, refreshed.email)
        token = refreshed.accessToken
      }
      // Guard — only ADMIN can be here
      if (role && role !== 'ADMIN') {
        router.replace('/dashboard')
        return
      }
      fetchUsers(token)
    }
    init()
  }, [])

  const fetchUsers = async (token: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/users/admin', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { clearAuth(); router.replace('/login'); return }
      const data = await res.json()
      setUsers(data.users)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!confirm(`Delete user "${userEmail}"? This cannot be undone.`)) return
    setDeletingId(userId)
    try {
      const res = await fetch(`/api/users/admin/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.message || 'Failed to delete user')
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      const res = await fetch('/api/users/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          role: formRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.message || 'Failed to create user')
        return
      }
      // Add new user to list and reset form
      setUsers((prev) => [data.user, ...prev])
      setFormEmail('')
      setFormPassword('')
      setFormRole('OPERATOR')
      setShowForm(false)
    } finally {
      setFormLoading(false)
    }
  }

  const roleBadgeClass = (r: string) => {
    if (r === 'ADMIN') return 'bg-red-900 text-red-300'
    if (r === 'OPERATOR') return 'bg-blue-900 text-blue-300'
    return 'bg-zinc-700 text-zinc-300'
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </button>
        <span className="font-semibold">User Management</span>
        <span className="text-sm text-zinc-400">{role}</span>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Manage who has access to SecureGate
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setFormError(null) }}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {showForm ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {/* Create User Form */}
        {showForm && (
          <div className="mb-8 rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">New User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="user@securegate.local"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="OPERATOR">OPERATOR</option>
                  <option value="AUDITOR">AUDITOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              {formError && (
                <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
                  {formError}
                </div>
              )}
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {formLoading ? 'Creating…' : 'Create User'}
              </button>
            </form>
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <div className="py-20 text-center text-zinc-500">Loading users…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {users.map((user) => (
                  <tr key={user.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                    <td className="px-4 py-3 text-zinc-200">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(user.id, user.email)}
                        disabled={deletingId === user.id}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-700 hover:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === user.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}