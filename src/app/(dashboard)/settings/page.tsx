'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatTHB, formatNumber } from '@/lib/utils'
import type { Target } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function monthLabel(m: string) {
  // 'YYYY-MM-DD' → 'Jan 2026'
  try {
    return new Date(m + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return m
  }
}

export default function SettingsPage() {
  const { data: targets, mutate } = useSWR<Target[]>('/api/targets', fetcher)

  const [form, setForm] = useState({
    month:          '',
    dynamic_cmg:    '',
    sales_target:   '',
    buying_target:  '',
    contact_target: '',
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
        month:          form.month,
        dynamic_cmg:    form.dynamic_cmg.trim(),
        sales_target:   form.sales_target   ? parseFloat(form.sales_target)   : null,
        buying_target:  form.buying_target  ? parseFloat(form.buying_target)  : null,
        contact_target: form.contact_target ? parseFloat(form.contact_target) : null,
      }),
    })
    if (res.ok) {
      setSaveMsg('Target saved!')
      setForm({ month: '', dynamic_cmg: '', sales_target: '', buying_target: '', contact_target: '' })
      mutate()
    } else {
      const d = await res.json()
      setSaveMsg('Error: ' + (d.error ?? 'Unknown'))
    }
    setSaving(false)
  }

  async function deleteTarget(month: string, dynamic_cmg: string) {
    await fetch(`/api/targets?month=${encodeURIComponent(month)}&dynamic_cmg=${encodeURIComponent(dynamic_cmg)}`, {
      method: 'DELETE',
    })
    mutate()
  }

  const today = new Date().toISOString().slice(0, 7)  // 'YYYY-MM'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage sales targets per Dynamic CMG and month</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add / Update Target
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveTarget} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Month</label>
              <Input
                type="month"
                value={form.month.slice(0, 7)}
                onChange={e => setForm(f => ({ ...f, month: e.target.value + '-01' }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Dynamic CMG</label>
              <Input
                placeholder="e.g. CMG_A"
                value={form.dynamic_cmg}
                onChange={e => setForm(f => ({ ...f, dynamic_cmg: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Sales Target (THB)</label>
              <Input
                type="number"
                placeholder="3000000"
                value={form.sales_target}
                onChange={e => setForm(f => ({ ...f, sales_target: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Buying Target (THB)</label>
              <Input
                type="number"
                placeholder="optional"
                value={form.buying_target}
                onChange={e => setForm(f => ({ ...f, buying_target: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Contact Target</label>
              <Input
                type="number"
                placeholder="100"
                value={form.contact_target}
                onChange={e => setForm(f => ({ ...f, contact_target: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
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
                const isActive = t.month.slice(0, 7) === today
                return (
                  <div
                    key={`${t.month}__${t.dynamic_cmg}`}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{monthLabel(t.month)}</span>
                        <span className="text-sm text-muted-foreground">— {t.dynamic_cmg}</span>
                        {isActive && <Badge variant="success">Current Month</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-x-3">
                        {t.sales_target   != null && <span>Sales: {formatTHB(t.sales_target)}</span>}
                        {t.buying_target  != null && <span>Buying: {formatTHB(t.buying_target)}</span>}
                        {t.contact_target != null && <span>Contact: {formatNumber(t.contact_target)}</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTarget(t.month, t.dynamic_cmg)}
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
