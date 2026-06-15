'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'

interface MultiSelectProps {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  options: { value: string; label: string }[]
  width?: string
}

export function MultiSelect({ label, value, onChange, options, width = 'w-36' }: MultiSelectProps) {
  // [] = all selected (no filter); [A,B] = only A and B active
  const allSelected = value.length === 0

  const isChecked = (v: string) => allSelected || value.includes(v)

  const toggle = (v: string) => {
    if (allSelected) {
      // Deselect one → include all except this one
      onChange(options.map(o => o.value).filter(x => x !== v))
    } else if (value.includes(v)) {
      const next = value.filter(x => x !== v)
      // If everything is now unchecked → back to all-selected
      onChange(next.length === 0 ? [] : next)
    } else {
      const next = [...value, v]
      // If all options are now explicitly selected → collapse back to []
      onChange(next.length === options.length ? [] : next)
    }
  }

  const excluded = allSelected ? 0 : options.length - value.length
  const displayLabel = allSelected
    ? label
    : excluded === 0
    ? label
    : excluded === options.length
    ? label
    : value.length === 1
    ? (options.find(o => o.value === value[0])?.label ?? value[0])
    : `${value.length} of ${options.length}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-8 ${width} text-sm font-normal justify-between px-3`}
        >
          <span className={`truncate ${!allSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
            {displayLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <div className="max-h-64 overflow-y-auto">
          {options.map(o => (
            <div
              key={o.value}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer select-none"
              onClick={() => toggle(o.value)}
            >
              <Checkbox
                checked={isChecked(o.value)}
                className="pointer-events-none"
              />
              <span className="text-sm leading-none">{o.label}</span>
            </div>
          ))}
        </div>
        {!allSelected && (
          <>
            <div className="h-px bg-border my-1" />
            <button
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-sm hover:bg-accent"
              onClick={() => onChange([])}
            >
              Select all
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
