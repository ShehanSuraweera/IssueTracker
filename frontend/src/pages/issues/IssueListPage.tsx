import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { ISSUE_COLS } from "@/components/issue/issue-columns";
import { IssueSidebar } from "@/components/issue/IssueSidebar";
import { IssueHeader } from "@/components/issue/IssueHeader";
import { IssueToolbar } from "@/components/issue/IssueToolbar";
import { useIssueListState } from "@/hooks/use-issue-list-state";
import type { SortField } from "@/hooks/use-issue-list-state";
import type { IssueSummary } from "@/types/issues";

export default function IssueListPage() {
  const navigate = useNavigate();
  const s = useIssueListState();

  return (
    <div className="h-full flex overflow-hidden">

      <IssueSidebar
        sidebarOpen={s.sidebarOpen}
        mobileSidebarOpen={s.mobileSidebarOpen}
        setMobileSidebarOpen={s.setMobileSidebarOpen}
        openSidebarClose={s.openSidebarClose}
        activeTab={s.activeTab}
        setActiveTab={s.setActiveTab}
        sortedGroups={s.sortedGroups}
        collapsed={s.collapsed}
        pinned={s.pinned}
        activeViewId={s.activeViewId}
        toggleCollapse={s.toggleCollapse}
        togglePin={s.togglePin}
        selectView={s.selectView}
        savedViews={s.savedViews}
        savedViewsLoading={s.savedViewsLoading}
        selectSavedView={s.selectSavedView}
        deleteSavedView={s.deleteSavedView}
        deleteSavedViewMutation={s.deleteSavedViewMutation}
        renamingId={s.renamingId}
        setRenamingId={s.setRenamingId}
        renameName={s.renameName}
        setRenameName={s.setRenameName}
        renameError={s.renameError}
        setRenameError={s.setRenameError}
        commitRename={s.commitRename}
        renameSavedViewMutation={s.renameSavedViewMutation}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        <IssueHeader
          sidebarOpen={s.sidebarOpen}
          openSidebarOpen={s.openSidebarOpen}
          setMobileSidebarOpen={s.setMobileSidebarOpen}
          activeViewLabel={s.activeViewLabel}
          totalCount={s.totalCount}
          dataUpdatedAt={s.dataUpdatedAt}
          isFetching={s.isFetching}
          refetch={s.refetch}
          isExporting={s.isExporting}
          handleExport={s.handleExport}
          hasRole={s.hasRole}
          onNew={() => navigate("/issues/new")}
        />

        <IssueToolbar
          search={s.search}
          setSearch={s.setSearch}
          extraFilters={s.extraFilters}
          setExtraFilter={s.setExtraFilter}
          setExtraFilters={s.setExtraFilters}
          extraFilterCount={s.extraFilterCount}
          sortField={s.sortField}
          sortDir={s.sortDir}
          cycleSort={s.cycleSort}
          groupBy={s.groupBy}
          setGroupBy={s.setGroupBy}
          activeViewId={s.activeViewId}
          activeViewLabel={s.activeViewLabel}
          saveViewOpen={s.saveViewOpen}
          setSaveViewOpen={s.setSaveViewOpen}
          saveViewName={s.saveViewName}
          setSaveViewName={s.setSaveViewName}
          saveNameError={s.saveNameError}
          setSaveNameError={s.setSaveNameError}
          saveViewInputRef={s.saveViewInputRef}
          handleSaveView={s.handleSaveView}
          createSavedViewMutation={s.createSavedViewMutation}
          deleteSavedView={s.deleteSavedView}
          deleteSavedViewMutation={s.deleteSavedViewMutation}
        />

        <div ref={s.scrollRef} className="flex-1 overflow-auto">
          <DataTable
            variant="page"
            columns={ISSUE_COLS}
            data={s.allItems}
            groupedData={s.grouped}
            isLoading={s.isLoading || s.search !== s.debouncedSearch || s.dataParamKeyRef.current !== s.currentParamKey}
            onRowClick={s.openIssue}
            emptyMessage="No issues found."
            tableClassName="min-w-190"
            sortField={s.sortField}
            sortDir={s.sortDir}
            onSort={(key) => s.cycleSort(key as SortField)}
            rowKey={(row) => (row as IssueSummary).id}
          />
          {s.isFetchingNextPage && (
            <div className="flex items-center justify-center py-3 border-t">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={s.sentinelRef} className="h-1" />
        </div>

      </div>
    </div>
  );
}
