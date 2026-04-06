"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Key, Link2, Link2Off, LogOut, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

function useFlashSaved(duration = 3000) {
  const [saved, setSaved] = useState(false)
  const flash = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), duration)
  }, [duration])
  return { saved, flash }
}

interface AuthUser { id: string; email: string; createdAt: string }
interface ApiKeyStatus { providers: string[] }
interface StravaStatus { connected: boolean; athleteId: number | null; lastSynced: string | null }

interface Profile {
  sex: "male" | "female" | "other" | null
  weightKg: number | null
  heightCm: number | null
  maxHeartRate: number | null
  ftpWatts: number | null
  vo2max: number | null
  goals: string | null
  preferences: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [claudeKey, setClaudeKey] = useState("")
  const { saved: keySaved, flash: flashKeySaved } = useFlashSaved()

  const [profileForm, setProfileForm] = useState<Profile>({
    sex: null, weightKg: null, heightCm: null,
    maxHeartRate: null, ftpWatts: null, vo2max: null,
    goals: null, preferences: null,
  })
  const { saved: profileSaved, flash: flashProfileSaved } = useFlashSaved()

  const { data: user } = useQuery<AuthUser>({ queryKey: ["me"], queryFn: () => api.get("/auth/me") })
  const { data: profile } = useQuery<Profile>({ queryKey: ["profile"], queryFn: () => api.get("/settings/profile") })
  const { data: apiKeyStatus } = useQuery<ApiKeyStatus>({ queryKey: ["api-key-status"], queryFn: () => api.get("/settings/apikey") })
  const { data: stravaStatus } = useQuery<StravaStatus>({ queryKey: ["strava-status"], queryFn: () => api.get("/strava/status") })

  useEffect(() => { if (profile) setProfileForm(profile) }, [profile])

  const saveProfileMutation = useMutation({
    mutationFn: () => api.put("/settings/profile", profileForm),
    onSuccess: () => { flashProfileSaved(); qc.invalidateQueries({ queryKey: ["profile"] }) },
  })

  const saveKeyMutation = useMutation({
    mutationFn: () => api.post("/settings/apikey", { provider: "anthropic", key: claudeKey }),
    onSuccess: () => { flashKeySaved(); setClaudeKey(""); qc.invalidateQueries({ queryKey: ["api-key-status"] }) },
  })

  const deleteKeyMutation = useMutation({
    mutationFn: () => api.delete("/settings/apikey/anthropic"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-key-status"] }),
  })

  const disconnectStravaMutation = useMutation({
    mutationFn: () => api.delete("/strava/disconnect"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strava-status"] }),
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => router.push("/setup"),
  })

  const hasAnthropicKey = apiKeyStatus?.providers.includes("anthropic")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your FitCoach configuration</p>
      </div>

      {/* Athlete Profile */}
      <Card>
        <CardHeader className="pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-primary" /> Athlete Profile
          </CardTitle>
          <CardDescription>Personal stats help the AI tailor recommendations to your physiology.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sex">Sex</Label>
              <select
                id="sex"
                value={profileForm.sex ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, sex: (e.target.value || null) as Profile["sex"] }))}
                className="flex h-9 w-full rounded-xl border border-white/42 bg-white/22 backdrop-blur-sm px-3 py-1 text-sm"
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" step="0.1" min="30" max="300" placeholder="70"
                value={profileForm.weightKg ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, weightKg: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="height">Height (cm)</Label>
              <Input id="height" type="number" step="1" min="100" max="250" placeholder="175"
                value={profileForm.heightCm ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, heightCm: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="maxhr">Max Heart Rate (bpm)</Label>
              <Input id="maxhr" type="number" step="1" min="100" max="250" placeholder="185"
                value={profileForm.maxHeartRate ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, maxHeartRate: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ftp">FTP (watts)</Label>
              <Input id="ftp" type="number" step="1" min="50" max="600" placeholder="250"
                value={profileForm.ftpWatts ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, ftpWatts: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vo2max">VO2Max (ml/kg/min)</Label>
              <Input id="vo2max" type="number" step="0.1" min="20" max="100" placeholder="50"
                value={profileForm.vo2max ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, vo2max: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="goals">Training Goals</Label>
              <Textarea id="goals" rows={3} maxLength={1000}
                placeholder="e.g. Complete a marathon in under 4 hours, improve FTP by 10%…"
                value={profileForm.goals ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, goals: e.target.value || null }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="preferences">Preferences & Notes</Label>
              <Textarea id="preferences" rows={3} maxLength={1000}
                placeholder="e.g. Prefer morning runs, avoid high-intensity back-to-back days…"
                value={profileForm.preferences ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, preferences: e.target.value || null }))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? "Saving…" : "Save profile"}
            </Button>
            {profileSaved && (
              <span className="text-sm text-emerald-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Claude API Key */}
      <Card>
        <CardHeader className="pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Key className="h-4 w-4 text-primary" /> Claude API Key
          </CardTitle>
          <CardDescription>Required for AI recommendations and coaching. Get a key at console.anthropic.com.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {hasAnthropicKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-400/40 bg-emerald-50 text-emerald-700">
                  <CheckCircle className="h-3 w-3 mr-1" /> Key saved
                </Badge>
                <span className="text-sm text-muted-foreground">API key is configured</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => deleteKeyMutation.mutate()} disabled={deleteKeyMutation.isPending}>
                Remove key
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="claude-key">API Key</Label>
                <Input id="claude-key" type="password" value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)} placeholder="sk-ant-api03-…" />
              </div>
              <Button size="sm" onClick={() => saveKeyMutation.mutate()} disabled={!claudeKey.trim() || saveKeyMutation.isPending}>
                {saveKeyMutation.isPending ? "Saving…" : "Save key"}
              </Button>
              {keySaved && <p className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Saved</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strava */}
      <Card>
        <CardHeader className="pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Link2 className="h-4 w-4 text-primary" /> Strava
          </CardTitle>
          <CardDescription>Connect Strava to import activities automatically via OAuth.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {stravaStatus?.connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-400/40 bg-emerald-50 text-emerald-700">
                  <CheckCircle className="h-3 w-3 mr-1" /> Connected
                </Badge>
                {stravaStatus.athleteId && <span className="text-sm text-muted-foreground">Athlete #{stravaStatus.athleteId}</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnectStravaMutation.mutate()} disabled={disconnectStravaMutation.isPending}>
                <Link2Off className="h-4 w-4" /> Disconnect
              </Button>
            </div>
          ) : (
            <Button asChild size="sm">
              <a href={`${process.env.NEXT_PUBLIC_API_URL}/strava/connect`}>
                <Link2 className="h-4 w-4" /> Connect Strava
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader className="pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-primary" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {user && (
            <div className="space-y-1">
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
          )}
          <Separator />
          <Button variant="outline" size="sm" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            <LogOut className="h-4 w-4" />
            {logoutMutation.isPending ? "Logging out…" : "Logout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
