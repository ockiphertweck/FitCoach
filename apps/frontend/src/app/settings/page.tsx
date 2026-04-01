"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Key, Link2, Link2Off, LogOut, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"

interface User {
  id: string
  email: string
  createdAt: string
}

interface ApiKeyStatus {
  providers: string[]
}

interface StravaStatus {
  connected: boolean
  athleteId: number | null
  lastSynced: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [claudeKey, setClaudeKey] = useState("")
  const [keySaved, setKeySaved] = useState(false)

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me"),
  })

  const { data: apiKeyStatus } = useQuery<ApiKeyStatus>({
    queryKey: ["api-key-status"],
    queryFn: () => api.get("/settings/apikey"),
  })

  const { data: stravaStatus } = useQuery<StravaStatus>({
    queryKey: ["strava-status"],
    queryFn: () => api.get("/strava/status"),
  })

  const saveKeyMutation = useMutation({
    mutationFn: () => api.post("/settings/apikey", { provider: "anthropic", key: claudeKey }),
    onSuccess: () => {
      setKeySaved(true)
      setClaudeKey("")
      qc.invalidateQueries({ queryKey: ["api-key-status"] })
      setTimeout(() => setKeySaved(false), 3000)
    },
  })

  const deleteKeyMutation = useMutation({
    mutationFn: () => api.delete("/settings/apikey/anthropic"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-key-status"] }),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete("/strava/disconnect"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strava-status"] }),
  })

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => router.push("/setup"),
  })

  const hasAnthropicKey = apiKeyStatus?.providers.includes("anthropic")

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your FitCoach configuration</p>
      </div>

      {/* Claude API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" /> Claude API Key
          </CardTitle>
          <CardDescription>
            Required for AI recommendations and coaching chat. Get a key at console.anthropic.com.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAnthropicKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-green-300 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Key saved
                </Badge>
                <span className="text-sm text-muted-foreground">API key is configured</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteKeyMutation.mutate()}
                disabled={deleteKeyMutation.isPending}
              >
                Remove key
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="claude-key">API Key</Label>
                <Input
                  id="claude-key"
                  type="password"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                />
              </div>
              <Button
                onClick={() => saveKeyMutation.mutate()}
                disabled={!claudeKey.trim() || saveKeyMutation.isPending}
              >
                {saveKeyMutation.isPending ? "Saving…" : "Save key"}
              </Button>
              {keySaved && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Key saved successfully
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strava */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Strava
          </CardTitle>
          <CardDescription>
            Connect your Strava account to import activities automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stravaStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-green-300 text-green-700">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                    {stravaStatus.athleteId && (
                      <span className="text-sm text-muted-foreground">
                        Athlete #{stravaStatus.athleteId}
                      </span>
                    )}
                  </div>
                  {stravaStatus.lastSynced && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(stravaStatus.lastSynced).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <Link2Off className="h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button asChild>
              <a href={`${process.env.NEXT_PUBLIC_API_URL}/strava/connect`}>
                <Link2 className="h-4 w-4" />
                Connect Strava
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="space-y-1">
              <p className="text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}
          <Separator />
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4" />
            {logoutMutation.isPending ? "Logging out…" : "Logout"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
