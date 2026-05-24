import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle, Loader2, Building2, Globe, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateUser } from "@/hooks/use-users";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABEL, ROLE_COLORS, OFFICE_LABEL } from "@/lib/theme";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const schema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
});

type FormValues = z.infer<typeof schema>;

export default function ProfilePage() {
  const { user } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);
  const mutation = useUpdateUser(user?.id);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user?.fullName ?? "" },
  });

  if (!user) return null;

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your personal information</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg font-semibold text-white bg-brand-green">
                {initials(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-base truncate">{user.fullName}</p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              <Badge variant="outline" className={`mt-1 text-xs ${ROLE_COLORS[user.role]}`}>
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="space-y-2.5 text-sm text-muted-foreground">
            {user.company && (
              <div className="flex items-center gap-2">
                <Building2 className="size-4 shrink-0" />
                <span>{user.company.name}</span>
              </div>
            )}
            {user.office && (
              <div className="flex items-center gap-2">
                <Globe className="size-4 shrink-0" />
                <span>{OFFICE_LABEL[user.office] ?? user.office}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="size-4 shrink-0" />
              <span>
                Member since{" "}
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Display Name</CardTitle>
          <CardDescription>Update the name shown across the app</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((v) =>
              mutation.mutate(
                { fullName: v.fullName },
                {
                  onSuccess: (updated) => {
                    setUser({ ...user, fullName: updated.fullName });
                    reset({ fullName: updated.fullName });
                  },
                }
              )
            )}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...register("fullName")} />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            {mutation.isError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(mutation.error as { response?: { data?: { error?: { message?: string } } } })
                  ?.response?.data?.error?.message ?? "Failed to update profile"}
              </p>
            )}

            {mutation.isSuccess && (
              <p className="flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle className="size-4" />
                Profile updated successfully
              </p>
            )}

            <Button type="submit" disabled={mutation.isPending || !isDirty}>
              {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
