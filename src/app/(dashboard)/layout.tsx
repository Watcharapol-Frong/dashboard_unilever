import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { DateRangeProvider } from '@/context/DateRangeContext'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DateRangeProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </DateRangeProvider>
  )
}
