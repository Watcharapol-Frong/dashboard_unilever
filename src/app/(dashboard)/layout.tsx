import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { Prefetcher } from '@/components/layout/Prefetcher'
import { DateRangeProvider } from '@/context/DateRangeContext'
import { UploadQueueProvider } from '@/context/UploadQueueContext'
import { BuildProvider } from '@/context/BuildContext'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DateRangeProvider>
      <UploadQueueProvider>
      <BuildProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <TopBar />
            <Prefetcher />
            <div className="flex-1 p-3 sm:p-6 overflow-x-auto">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BuildProvider>
      </UploadQueueProvider>
    </DateRangeProvider>
  )
}
