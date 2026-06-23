import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { Prefetcher } from '@/components/layout/Prefetcher'
import { FreshnessBar } from '@/components/dashboard/FreshnessBar'
import { UploadQueueProvider } from '@/context/UploadQueueContext'
import { BuildProvider } from '@/context/BuildContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { HelpProvider } from '@/context/HelpContext'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ChatBot } from '@/components/dashboard/ChatBot'
import { HelpDrawer } from '@/components/help-drawer'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <UploadQueueProvider>
        <BuildProvider>
          <HelpProvider>
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
              <HelpDrawer />
            </SidebarProvider>
          </HelpProvider>
        </BuildProvider>
      </UploadQueueProvider>
    </LanguageProvider>
  )
}
