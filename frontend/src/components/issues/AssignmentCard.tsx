import { useState } from "react";
import { Loader2, Search, CheckCircle2, UserPlus, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OFFICE_LABEL } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { useEngineers } from "@/hooks/use-users";
import { useAssignIssue } from "@/hooks/use-issues";
import type { User as AuthUser } from "@/types/users";
import type { IssueDetail } from "@/types/issues";

interface AssignmentCardProps {
  issue:      IssueDetail;
  isAdmin:    boolean;
  isEngineer: boolean;
  user:       AuthUser | null;
}

export function AssignmentCard({ issue, isAdmin, isEngineer, user }: AssignmentCardProps) {
  const [search,         setSearch]         = useState("");
  const [pendingAssignId, setPendingAssignId] = useState<string | null>(null);

  const { data: engineers = [] } = useEngineers();
  const assignMutation = useAssignIssue(issue.id);

  const isClosed = issue.status === "closed" || issue.status === "cancelled";
  const assignee = issue.assignee;
  const isSelf   = !!user && !!assignee && assignee.id === user.id;

  const filtered = engineers.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase()),
  );

  const pendingEngineer = pendingAssignId ? engineers.find(e => e.id === pendingAssignId) : null;

  const confirmAssign = () => {
    if (!pendingAssignId) return;
    assignMutation.mutate(pendingAssignId, { onSettled: () => setPendingAssignId(null) });
  };

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm">Assignment</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {assignee ? (
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {assignee.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{assignee.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">{assignee.email}</p>
            </div>
            {isSelf && (
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 shrink-0">You</Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
              <User className="size-3.5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unassigned</p>
              <p className="text-xs text-muted-foreground/70">No engineer assigned</p>
            </div>
          </div>
        )}

        {!isClosed && (isAdmin || isEngineer) && (
          <>
            <Separator />

            {isAdmin && (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search engineers..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-md">
                  {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No engineers found</p>
                  ) : filtered.map(eng => {
                    const isAssigned = eng.id === assignee?.id;
                    const isPending  = pendingAssignId === eng.id;
                    const isLoading  = assignMutation.isPending && assignMutation.variables === eng.id;
                    return (
                      <Tooltip key={eng.id}>
                        <TooltipTrigger asChild>
                          <button
                            disabled={assignMutation.isPending || isAssigned}
                            onClick={() => !isAssigned && setPendingAssignId(eng.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
                              isAssigned ? "bg-primary/5 cursor-default" :
                              isPending  ? "bg-amber-50 border border-amber-200" :
                                           "hover:bg-muted cursor-pointer",
                              "disabled:opacity-60",
                            )}
                          >
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-[10px]">
                              {eng.fullName.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium flex-1 truncate">{eng.fullName}</span>
                            {eng.office && (
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                                {eng.office}
                              </span>
                            )}
                            {isLoading   && <Loader2      className="size-3.5 animate-spin text-muted-foreground shrink-0" />}
                            {isAssigned && !isLoading && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="p-3 space-y-2 max-w-52">
                          <div className="flex items-center gap-2">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                              {eng.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight truncate">{eng.fullName}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{eng.email}</p>
                            </div>
                          </div>
                          <div className="space-y-1 pt-1 border-t border-border/50">
                            {eng.office && (
                              <p className="text-[10px] text-muted-foreground">
                                <span className="font-semibold uppercase tracking-wide">Office</span>{" "}
                                {OFFICE_LABEL[eng.office] ?? eng.office}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                              <span className="font-semibold uppercase tracking-wide">Joined</span>{" "}
                              {fmtDate(eng.createdAt)}
                            </p>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border",
                              eng.isActive
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-red-50 text-red-600 border-red-200",
                            )}>
                              {eng.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                {pendingAssignId && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Assign to <span className="font-medium text-foreground">{pendingEngineer?.fullName}</span>?
                    </p>
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setPendingAssignId(null)}>Cancel</Button>
                      <Button size="sm" disabled={assignMutation.isPending} onClick={confirmAssign}>
                        {assignMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Assign"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isEngineer && !isSelf && (
              pendingAssignId === user?.id ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2.5 space-y-2">
                  <p className="text-xs text-muted-foreground">Assign this issue to yourself?</p>
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setPendingAssignId(null)}>Cancel</Button>
                    <Button size="sm" disabled={assignMutation.isPending} onClick={confirmAssign}>
                      {assignMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Assign to Me"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={assignMutation.isPending}
                  onClick={() => user && setPendingAssignId(user.id)}
                >
                  <UserPlus className="size-3.5 mr-1.5" />
                  Assign to Me
                </Button>
              )
            )}

            {isEngineer && isSelf && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 className="size-3.5" />
                Assigned to you
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
