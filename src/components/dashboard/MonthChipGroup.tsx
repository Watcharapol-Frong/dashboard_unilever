'use client'

interface MonthChipGroupProps {
  months: string[]
  rangeFrom:   string | null
  rangeTo:     string | null
  hoverMonth:  string | null
  onChipClick:   (m: string) => void
  onMouseEnter:  (m: string) => void
  onMouseLeave:  () => void
}

export function MonthChipGroup({
  months, rangeFrom, rangeTo, hoverMonth,
  onChipClick, onMouseEnter, onMouseLeave,
}: MonthChipGroupProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {months.map(m => {
        const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
        const active   = m === rangeFrom || m === rangeTo
        const inRange  = !!(rangeFrom && effectiveTo && m > rangeFrom && m < effectiveTo)
        const preview  = !!(!rangeTo && rangeFrom && hoverMonth && m > rangeFrom && m <= hoverMonth)
        return (
          <button
            key={m}
            onClick={() => onChipClick(m)}
            onMouseEnter={() => onMouseEnter(m)}
            onMouseLeave={onMouseLeave}
            className={[
              'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none border',
              active
                ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                : inRange || preview
                ? 'bg-[#003DA6]/10 text-[#003DA6] border-[#003DA6]/20'
                : 'bg-background text-muted-foreground border-gray-200 hover:bg-gray-50 hover:text-foreground',
            ].join(' ')}
          >
            {(() => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) })()}
          </button>
        )
      })}
    </div>
  )
}
