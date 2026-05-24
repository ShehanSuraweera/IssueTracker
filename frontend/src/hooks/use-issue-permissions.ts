import type { IssueDetail } from "@/types/issues";
import type { UserRole } from "@/types/auth";
import type { User } from "@/types/users";

export interface IssuePermissions {
  isStaff: boolean;
  isEngineer: boolean;
  isClosed: boolean;
  isSelf: boolean;
  canEdit: boolean;
  canResolve: boolean;
  canAssignSelf: boolean;
  canClose: boolean;
  canComment: boolean;
  isLocked: boolean;
}

export function useIssuePermissions(
  issue: IssueDetail,
  user: User | null,
  hasRole: (...roles: UserRole[]) => boolean,
): IssuePermissions {
  const isStaff = hasRole("admin", "engineer");
  const isEngineer = hasRole("engineer");
  const isClosed = issue.status === "closed" || issue.status === "cancelled";
  const isSelf = !!user && !!issue.assignee && issue.assignee.id === user.id;

  return {
    isStaff,
    isEngineer,
    isClosed,
    isSelf,
    canEdit: isStaff || issue.status === "new",
    canResolve:
      isStaff && (issue.status === "in_progress" || issue.status === "on_hold"),
    canAssignSelf: isEngineer && !isSelf && !isClosed,
    canClose:
      (hasRole("admin") || hasRole("client_user")) &&
      issue.status === "resolved",
    canComment: issue.status !== "closed" && issue.status !== "cancelled",
    isLocked: !isStaff && issue.status !== "new",
  };
}
