import type { IssueStatus, PriorityLevel } from "@/types/issues";
import type { UserRole } from "@/types/users";

export const STATUS_CONFIG: Record<IssueStatus, { label: string; cls: string }> = {
  new:         { label: "New",         cls: "bg-purple-100 text-purple-700 border-purple-200" },
  in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200"       },
  on_hold:     { label: "On Hold",     cls: "bg-amber-100 text-amber-700 border-amber-200"     },
  resolved:    { label: "Resolved",    cls: "bg-green-100 text-green-700 border-green-200"     },
  closed:      { label: "Closed",      cls: "bg-gray-100 text-gray-600 border-gray-200"        },
  cancelled:   { label: "Cancelled",   cls: "bg-red-100 text-red-600 border-red-200"           },
};

export const PRIORITY_CONFIG: Record<PriorityLevel, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-red-100 text-red-700 border-red-200"         },
  high:     { label: "High",     cls: "bg-orange-100 text-orange-700 border-orange-200" },
  moderate: { label: "Moderate", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low:      { label: "Low",      cls: "bg-sky-100 text-sky-700 border-sky-200"          },
};

export const IMPACT_BADGE: Record<string, string> = {
  low:    "bg-slate-100 text-slate-600 border-slate-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high:   "bg-rose-100 text-rose-700 border-rose-200",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin:       "bg-primary/10 text-primary border-primary/20",
  engineer:    "bg-blue-100 text-blue-700 border-blue-200",
  client_user: "bg-gray-100 text-gray-700 border-gray-200",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin:       "Admin",
  engineer:    "Engineer",
  client_user: "Client",
};

export const LEVEL_COLORS: Record<string, { active: string; idle: string }> = {
  low:    { active: "bg-slate-500 text-white", idle: "text-slate-500 hover:bg-slate-100/70" },
  medium: { active: "bg-amber-400 text-white", idle: "text-amber-600 hover:bg-amber-50"     },
  high:   { active: "bg-red-500   text-white", idle: "text-red-500   hover:bg-red-50"       },
};
