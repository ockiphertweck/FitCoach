"use client"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Segmented } from "@/components/ui/segmented"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import {
  GARMIN_NOT_CONNECTED,
  type GarminStatus,
  STATUS_KEY,
  refreshData,
  syncNow,
} from "@/lib/garmin"
import type { Dict } from "@/lib/i18n"
import { setLangCookie, useI18n } from "@/lib/i18n/client"
import { type Theme, parseTheme, setThemeCookie } from "@/lib/theme"
import { LANG_COOKIE, type Lang, parseLang } from "@fitcoach/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, CheckCircle, Key, LogOut, Palette, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

function garminLine(s: GarminStatus, t: Dict, locale: string) {
  if (s.status === "importing") return t.settings.importing
  if (s.lastError === "key_invalid") return t.errors.keyInvalid
  if (!s.lastSyncedAt) return t.settings.connected
  const mins = Math.round((Date.now() - new Date(s.lastSyncedAt).getTime()) / 60_000)
  const [n, unit] = relativeUnit(mins)
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-n, unit)
  return t.settings.connectedLastSync(rel)
}

function relativeUnit(mins: number): [number, Intl.RelativeTimeFormatUnit] {
  if (mins < 60) return [mins, "minute"]
  if (mins < 1440) return [Math.round(mins / 60), "hour"]
  return [Math.round(mins / 1440), "day"]
}

function useFlashSaved(duration = 3000) {
  const [saved, setSaved] = useState(false)
  const flash = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), duration)
  }, [duration])
  return { saved, flash }
}

interface AuthUser {
  id: string
  email: string
  createdAt: string
}
interface ApiKeyStatus {
  providers: string[]
}

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
  const [theme, setTheme] = useState<Theme>("system")
  // Server renders "system"; sync to what the layout actually applied.
  useEffect(() => setTheme(parseTheme(document.documentElement.dataset.theme)), [])
  const { t, locale } = useI18n()
  const [langChoice, setLangChoice] = useState<Lang | "auto">("auto")
  // Cookie absent = automatic; read after mount like the theme above.
  useEffect(() => {
    const value = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`))?.[1]
    setLangChoice(parseLang(value) ?? "auto")
  }, [])
  const { saved: keySaved, flash: flashKeySaved } = useFlashSaved()

  const [profileForm, setProfileForm] = useState<Profile>({
    sex: null,
    weightKg: null,
    heightCm: null,
    maxHeartRate: null,
    ftpWatts: null,
    vo2max: null,
    goals: null,
    preferences: null,
  })
  const { saved: profileSaved, flash: flashProfileSaved } = useFlashSaved()

  const { data: user } = useQuery<AuthUser>({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me"),
  })
  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => api.get("/settings/profile"),
  })
  const { data: apiKeyStatus } = useQuery<ApiKeyStatus>({
    queryKey: ["api-key-status"],
    queryFn: () => api.get("/settings/apikey"),
  })

  useEffect(() => {
    if (profile) setProfileForm(profile)
  }, [profile])

  const saveProfileMutation = useMutation({
    mutationFn: () => api.put("/settings/profile", profileForm),
    onSuccess: () => {
      flashProfileSaved()
      qc.invalidateQueries({ queryKey: ["profile"] })
      qc.invalidateQueries({ queryKey: ["recap"] })
    },
  })

  const saveKeyMutation = useMutation({
    mutationFn: () => api.post("/settings/apikey", { provider: "anthropic", key: claudeKey }),
    onSuccess: () => {
      flashKeySaved()
      setClaudeKey("")
      qc.invalidateQueries({ queryKey: ["api-key-status"] })
      qc.invalidateQueries({ queryKey: ["recap"] })
    },
  })

  const deleteKeyMutation = useMutation({
    mutationFn: () => api.delete("/settings/apikey/anthropic"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-key-status"] })
      qc.invalidateQueries({ queryKey: ["recap"] })
    },
  })

  const [garminKey, setGarminKey] = useState("")
  const { data: garmin } = useQuery<GarminStatus>({
    queryKey: STATUS_KEY,
    queryFn: () => api.get("/garmin/status"),
    refetchInterval: (q) => (q.state.data?.status === "importing" ? 5000 : false),
  })
  // Seed the cache so the Summary (staleTime 60 s) sees the change and doesn't recap mid-import.
  const setGarmin = (s: GarminStatus) => {
    qc.setQueryData(STATUS_KEY, s)
    refreshData(qc)
  }
  const connectGarmin = useMutation({
    mutationFn: () => api.post<GarminStatus>("/garmin/connect", { key: garminKey.trim() }),
    onSuccess: (s) => {
      setGarminKey("")
      setGarmin(s)
    },
  })
  const removeGarmin = useMutation({
    mutationFn: () => api.delete("/garmin/key"),
    onSuccess: () => setGarmin(GARMIN_NOT_CONNECTED),
  })
  const syncGarmin = useMutation({ mutationFn: () => syncNow(qc) })
  const connectError = (code: string) =>
    code === "rate_limited"
      ? t.settings.garminBusy
      : code === "garmin_unavailable"
        ? t.settings.garminUnavailable
        : code === "key_invalid"
          ? t.errors.keyInvalid
          : t.settings.connectionFailed
  const garminKeyForm = (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="garmin-key">{t.settings.garminKey}</Label>
        <Input
          id="garmin-key"
          type="password"
          autoComplete="off"
          value={garminKey}
          onChange={(e) => setGarminKey(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        onClick={() => connectGarmin.mutate()}
        disabled={!garminKey.trim() || connectGarmin.isPending}
      >
        {connectGarmin.isPending ? t.settings.connecting : t.settings.connect}
      </Button>
      {connectGarmin.error && (
        <p className="text-sm text-destructive">{connectError(connectGarmin.error.message)}</p>
      )}
    </div>
  )

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => router.push("/setup"),
  })

  const hasAnthropicKey = apiKeyStatus?.providers.includes("anthropic")

  return (
    <div className="space-y-4 lg:mx-auto lg:w-full lg:max-w-[640px]">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Palette className="h-4 w-4 text-primary" /> {t.settings.appearance}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t.settings.theme}</span>
            <Segmented
              aria-label={t.settings.appearance}
              value={theme}
              options={[
                { value: "system", label: t.settings.themeSystem },
                { value: "light", label: t.settings.themeLight },
                { value: "dark", label: t.settings.themeDark },
              ]}
              onChange={(v) => {
                setTheme(v)
                setThemeCookie(v)
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t.settings.language}</span>
            <Segmented
              aria-label={t.settings.language}
              value={langChoice}
              options={[
                { value: "auto", label: t.settings.languageAuto },
                { value: "de", label: "Deutsch" },
                { value: "en", label: "English" },
              ]}
              onChange={(v) => {
                setLangChoice(v)
                setLangCookie(v)
                router.refresh()
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Athlete Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-primary" /> {t.settings.athleteProfile}
          </CardTitle>
          <CardDescription>{t.settings.profileDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sex">{t.settings.sex}</Label>
              <select
                id="sex"
                value={profileForm.sex ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, sex: (e.target.value || null) as Profile["sex"] }))
                }
                className="flex h-9 w-full rounded-xl border-0 bg-muted px-3 py-1 text-sm"
              >
                <option value="">{t.settings.sexNone}</option>
                <option value="male">{t.settings.sexMale}</option>
                <option value="female">{t.settings.sexFemale}</option>
                <option value="other">{t.settings.sexOther}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="weight">{t.settings.weight}</Label>
              <Input
                id="weight"
                type="number"
                step="0.1"
                min="30"
                max="300"
                placeholder="70"
                value={profileForm.weightKg ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    weightKg: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="height">{t.settings.height}</Label>
              <Input
                id="height"
                type="number"
                step="1"
                min="100"
                max="250"
                placeholder="175"
                value={profileForm.heightCm ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    heightCm: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="maxhr">{t.settings.maxHr}</Label>
              <Input
                id="maxhr"
                type="number"
                step="1"
                min="100"
                max="250"
                placeholder="185"
                value={profileForm.maxHeartRate ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    maxHeartRate: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ftp">{t.settings.ftp}</Label>
              <Input
                id="ftp"
                type="number"
                step="1"
                min="50"
                max="600"
                placeholder="250"
                value={profileForm.ftpWatts ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    ftpWatts: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vo2max">{t.settings.vo2max}</Label>
              <Input
                id="vo2max"
                type="number"
                step="0.1"
                min="20"
                max="100"
                placeholder="50"
                value={profileForm.vo2max ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({
                    ...p,
                    vo2max: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="goals">{t.settings.goals}</Label>
              <Textarea
                id="goals"
                rows={3}
                maxLength={1000}
                placeholder={t.settings.goalsPlaceholder}
                value={profileForm.goals ?? ""}
                onChange={(e) => setProfileForm((p) => ({ ...p, goals: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="preferences">{t.settings.preferences}</Label>
              <Textarea
                id="preferences"
                rows={3}
                maxLength={1000}
                placeholder={t.settings.preferencesPlaceholder}
                value={profileForm.preferences ?? ""}
                onChange={(e) =>
                  setProfileForm((p) => ({ ...p, preferences: e.target.value || null }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => saveProfileMutation.mutate()}
              disabled={saveProfileMutation.isPending}
            >
              {saveProfileMutation.isPending ? t.settings.saving : t.settings.saveProfile}
            </Button>
            {profileSaved && (
              <span className="text-sm text-emerald-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> {t.settings.saved}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Garmin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Activity className="h-4 w-4 text-primary" /> Garmin
          </CardTitle>
          <CardDescription>
            {t.settings.garminDescriptionBefore}{" "}
            <a
              href="https://connect.garmin.com/app/settings/personalApiToken"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {t.settings.garminTokenLink}
            </a>{" "}
            {t.settings.garminDescriptionAfter}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {garmin?.connected ? (
            <div className="space-y-3">
              <p className="text-sm">{garminLine(garmin, t, locale)}</p>
              {garmin.keyExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  {t.settings.keyExpires(new Date(garmin.keyExpiresAt).toLocaleDateString(locale))}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => syncGarmin.mutate()}
                  disabled={syncGarmin.isPending || garmin.status === "importing"}
                >
                  {syncGarmin.isPending ? t.settings.syncing : t.settings.syncNow}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t.settings.removeGarminKey}
                  onClick={() => removeGarmin.mutate()}
                  disabled={removeGarmin.isPending}
                >
                  {t.settings.removeKey}
                </Button>
              </div>
              {/* Expired/revoked key: paste a new one (connect upserts it). */}
              {garmin.lastError === "key_invalid" && garminKeyForm}
            </div>
          ) : (
            garminKeyForm
          )}
        </CardContent>
      </Card>

      {/* Claude API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Key className="h-4 w-4 text-primary" /> {t.settings.claudeKey}
          </CardTitle>
          <CardDescription>{t.settings.claudeKeyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAnthropicKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle className="h-3 w-3 mr-1" /> {t.settings.keySaved}
                </Badge>
                <span className="text-sm text-muted-foreground">{t.settings.keyConfigured}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteKeyMutation.mutate()}
                disabled={deleteKeyMutation.isPending}
              >
                {t.settings.removeKey}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="claude-key">{t.settings.apiKey}</Label>
                <Input
                  id="claude-key"
                  type="password"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-api03-…"
                />
              </div>
              <Button
                size="sm"
                onClick={() => saveKeyMutation.mutate()}
                disabled={!claudeKey.trim() || saveKeyMutation.isPending}
              >
                {saveKeyMutation.isPending ? t.settings.saving : t.settings.saveKey}
              </Button>
              {keySaved && (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {t.settings.saved}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <User className="h-4 w-4 text-primary" /> {t.settings.account}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="space-y-1">
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {t.settings.memberSince(new Date(user.createdAt).toLocaleDateString(locale))}
              </p>
            </div>
          )}
          <Separator className="bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4" />
            {logoutMutation.isPending ? t.settings.loggingOut : t.settings.logout}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
