import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import { ensureBackgroundMusic, preloadBackgroundMusic } from "@/lib/bgm";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    preloadBackgroundMusic();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    ensureBackgroundMusic();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.signedIn"));
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("auth.signUpSuccess"));
  }

  const hint = t("auth.passwordHint");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher compact />
        </div>
        <div className="mb-8 flex items-center gap-3 justify-center">
          <div className="grid grid-cols-1 gap-1">
            <span className="h-3 w-3 rounded-full bg-status-red shadow-glow-red" />
            <span className="h-3 w-3 rounded-full bg-status-yellow shadow-glow-yellow" />
            <span className="h-3 w-3 rounded-full bg-status-green shadow-glow-green" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("auth.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("auth.tagline")}</p>
          </div>
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>{t("auth.cardTitle")}</CardTitle>
            <CardDescription>{t("auth.cardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 mb-4 w-full">
                <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">{t("auth.email")}</Label>
                    <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pass">{t("auth.password")}</Label>
                    <Input id="si-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    <Activity className="mr-2 h-4 w-4" />
                    {loading ? t("auth.signingIn") : t("auth.signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">{t("auth.name")}</Label>
                    <Input id="su-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("auth.yourName")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">{t("auth.email")}</Label>
                    <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pass">{t("auth.password")}</Label>
                    <Input id="su-pass" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <p
                      className="text-xs text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: hint }}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? t("auth.creating") : t("auth.createAccount")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
