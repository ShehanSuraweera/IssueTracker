import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Send, User } from "lucide-react";
import { useIssue, useAddComment, useResolveIssue } from "@/hooks/use-issues";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_STYLES: Record<string, string> = {
  new:         "bg-purple-100 text-purple-700",
  in_progress: "bg-blue-100 text-blue-700",
  on_hold:     "bg-yellow-100 text-yellow-700",
  resolved:    "bg-green-100 text-green-700",
  closed:      "bg-gray-100 text-gray-600",
  cancelled:   "bg-red-100 text-red-700",
};

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: issue, isLoading } = useIssue(id);
  const commentMutation = useAddComment(id);
  const resolveMutation = useResolveIssue(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!issue) return null;

  const canResolve =
    hasRole("admin", "engineer") &&
    (issue.status === "in_progress" || issue.status === "on_hold");

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">{issue.ticketNumber}</span>
          <Badge className={`text-xs ${STATUS_STYLES[issue.status]}`} variant="outline">
            {issue.status.replace("_", " ")}
          </Badge>
          <Badge variant="secondary" className="text-xs">{issue.priority}</Badge>
          <Badge variant="outline" className="text-xs">{issue.type.replace("_", " ")}</Badge>
        </div>
        <h1 className="text-xl font-semibold">{issue.title}</h1>
        <p className="text-sm text-muted-foreground">
          {issue.product.name} · opened by {issue.creator.fullName} ·{" "}
          {new Date(issue.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Description */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
        </CardContent>
      </Card>

      {/* Actions */}
      {canResolve && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => resolveMutation.mutate()}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Mark resolved
          </Button>
        </div>
      )}

      <Separator />

      {/* Comments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Comments ({issue.comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {issue.comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {issue.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.user.fullName}</span>
                  {c.isInternal && (
                    <Badge variant="secondary" className="text-xs">internal</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
          ))}

          {/* Add comment */}
          {issue.status !== "closed" && issue.status !== "cancelled" && (
            <div className="space-y-2 pt-2">
              <textarea
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                rows={3}
                placeholder="Write a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <div className="flex items-center justify-between">
                {hasRole("admin", "engineer") && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal note
                  </label>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!commentBody.trim() || commentMutation.isPending}
                  onClick={() =>
                    commentMutation.mutate(
                      { body: commentBody, isInternal },
                      { onSuccess: () => setCommentBody("") },
                    )
                  }
                >
                  {commentMutation.isPending
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Send className="size-4" />}
                  Post
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
