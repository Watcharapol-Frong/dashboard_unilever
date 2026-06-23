'use client'

import { createContext, useContext, useState } from 'react'

type HelpContextType = {
  isOpen: boolean
  setOpen: (open: boolean) => void
}

const HelpContext = createContext<HelpContextType>({ isOpen: false, setOpen: () => {} })

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  return (
    <HelpContext.Provider value={{ isOpen, setOpen }}>
      {children}
    </HelpContext.Provider>
  )
}

export function useHelp() {
  return useContext(HelpContext)
}
