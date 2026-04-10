import { PostHog } from "posthog-node"
import { env } from "../env.js"

let _posthog: PostHog | null = null

if (env.POSTHOG_API_KEY) {
  _posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}

export const posthog = _posthog
