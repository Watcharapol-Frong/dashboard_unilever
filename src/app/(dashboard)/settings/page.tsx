'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatTHB, formatDate, formatNumber } from '@/lib/utils'
import type { Target } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function SettingsPage() {
  const { data: targets, mutate } = useSWR<Target[]>('/api/targets', fetcher)

  const [form, setForm] = useState({
    period_label: '', period_start: '', period_end: '',
    sales_target_thb: '', new_customer_target: '', call_target: '', channel: 'all'
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  async function saveTarget(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period_label: form.period_label,
        period_start: form.period_start,
        period_end: form.period_end,
        sales_target_thb: parseFloat(form.sales_target_thb) || 0,
        new_customer_target: parseInt(form.new_customer_target) || 0,
        call_target: parseInt(form.call_target) || 0,
        channel: form.channel,
      }),
    })
    if (res.ok) {
      setSaveMsg('Target saved!')
      setForm({ period_label: '', period_start: '', period_end: '', sales_target_thb: '', new_customer_target: '', call_target: '', channel: 'all' })
      mutate()
    } else {
      const d = await res.json()
      setSaveMsg('Error: ' + (d.error ?? 'Unknown'))
    }
    setSaving(false)
  }

  async function deleteTarget(id: string) {
    await fetch(`/api/targets?id=${id}`, { method: 'DELETE' })
    mutate()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage KPI targets for each campaign period</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Target Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveTarget} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <label className="text-xs font-medium">Period Label</label>
              <Input placeholder="e.g. May 2026" value={form.period_label} onChange={e => setForm(f => ({ ...f, period_label: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Start Date</label>
              <Input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">End Date</label>
              <Input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Sales Target (THB)</label>
              <Input type="number" placeholder="3000000" value={form.sales_target_thb} onChange={e => setForm(f => ({ ...f, sales_target_thb: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">New Customer Target</label>
              <Input type="number" placeholder="100" value={form.new_customer_target} onChange={e => setForm(f => ({ ...f, new_customer_target: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Call Target</label>
              <Input type="number" placeholder="1000" value={form.call_target} onChange={e => setForm(f => ({ ...f, call_target: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Channel</label>
              <Select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                <option value="all">All Channels</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </Select>
            </div>
            <div className="flex items-end col-span-2 md:col-span-1">
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? 'Saving...' : 'Save Target'}
              </Button>
            </div>
            {saveMsg && (
              <p className={`col-span-full text-sm ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                {saveMsg}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Saved Targets</CardTitle></CardHeader>
        <CardContent>
          {!targets?.length ? (
            <p className="text-muted-foreground text-sm text-center py-6">No targets set yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {targets.map(t => {
                const isActive = t.period_start <= today && t.period_end >= today
                return (
                  <div key={t.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.period_label}</span>
                        {isActive && <Badge variant="success">Active</Badge>}
                        <Badge variant="secondary">{t.channel}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(t.period_start)} — {formatDate(t.period_end)}
                        &nbsp;|&nbsp;Sales: {formatTHB(t.sales_target_thb)}
                        &nbsp;|&nbsp;New Customers: {formatNumber(t.new_customer_target)}
                        &nbsp;|&nbsp;Calls: {formatNumber(t.call_target)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTarget(t.id)}
                      className="text-muted-foreground hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
