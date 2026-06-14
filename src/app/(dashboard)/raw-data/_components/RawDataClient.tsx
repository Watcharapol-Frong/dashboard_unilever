'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table2, LayoutGrid } from 'lucide-react'
import BrowseTab    from './BrowseTab'
import PivotBuilder from './PivotBuilder'

export default function RawDataClient() {
  return (
    <Tabs defaultValue="browse" className="gap-4">
      <TabsList className="bg-gray-100/80 p-1 rounded-xl">
        <TabsTrigger value="browse" className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-[#003DA6] data-[state=active]:shadow-sm transition-all">
          <Table2 className="h-3.5 w-3.5" />Browse
        </TabsTrigger>
        <TabsTrigger value="pivot" className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-[#003DA6] data-[state=active]:shadow-sm transition-all">
          <LayoutGrid className="h-3.5 w-3.5" />Pivot
        </TabsTrigger>
      </TabsList>
      <TabsContent value="browse"><BrowseTab /></TabsContent>
      <TabsContent value="pivot"><PivotBuilder /></TabsContent>
    </Tabs>
  )
}
