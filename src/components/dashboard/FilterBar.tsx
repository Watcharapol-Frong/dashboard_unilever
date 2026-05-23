interface FilterBarProps {
  children: React.ReactNode
  onClear?: () => void
  hasFilter?: boolean
}

export function FilterBar({ children, onClear, hasFilter }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {children}
      {hasFilter && onClear && (
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
