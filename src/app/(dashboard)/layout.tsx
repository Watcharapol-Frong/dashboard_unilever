import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { Prefetcher } from '@/components/layout/Prefetcher'
import { FreshnessBar } from '@/components/dashboard/FreshnessBar'
import { DateRangeProvider } from '@/context/DateRangeContext'
import { UploadQueueProvider } from '@/context/UploadQueueContext'
import { BuildProvider } from '@/context/BuildContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ChatBot } from '@/components/dashboard/ChatBot'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <DateRangeProvider>
        <UploadQueueProvider>
        <BuildProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <TopBar />
              <FreshnessBar />
              <Prefetcher />
              <div className="flex-1 p-3 sm:p-6 overflow-x-auto">
                {children}
              </div>
              <ChatBot />
            </SidebarInset>
          </SidebarProvider>
        </BuildProvider>
        </UploadQueueProvider>
      </DateRangeProvider>
    </LanguageProvider>
  )
}
