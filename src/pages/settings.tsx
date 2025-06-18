import { useConvex } from "../lib/convex/provider"
import { useCurrentUser } from "./protected"
import { Button } from "../components/buttons"
import { LogoutIcon, TrashIcon } from "../components/icons"
import { useOpenRouter } from "../lib/openrouter"
import { OpenRouterDisconnect, OpenRouterConnect } from "./openrouter"
import { Logo } from "../components/logo"
import { Show } from "solid-js"


export function SettingsPage() {
  let { user } = useCurrentUser()
  let { auth } = useConvex()
  let openRouter = useOpenRouter()

  async function signOut() {
    localStorage.clear()
    await clearDatabase()
    auth.signOut()
  }

  async function clearDatabase() {
    try {
      let databases = await window.indexedDB.databases()
      for (let db of databases) {
        if (db.name) {
          await window.indexedDB.deleteDatabase(db.name)
        }
      }
    } catch (error) {
      console.error("Error deleting databases:", error)
    }
  }

  return (
    <main>
      <div class="grid grid-cols-2 gap-16 max-w-4xl mx-auto py-32 px-4">
        <div class="max-w-xs">
          <div class="flex justify-center pb-16">
            <Logo />
          </div>
          <img src={user.avatar}
            alt={`${user.name}'s profile picture`}
            class="block mx-auto size-24 rounded-full border-4 border-primary/20" />
          <h1 class="text-xl font-medium text-center">{user.name}</h1>
          <p class="text-on-surface-light text-center">{user.email}</p>
          <div class="pt-8 flex-grow">
            <Button
              label="Sign Out"
              style="neutral"
              onClick={signOut}
              fullWidth
              appendIcon={<LogoutIcon class="size-4 text-primary" />}
            />
          </div>
        </div>
        <div >
          <Show when={!openRouter.key}>
            <OpenRouterConnect />
          </Show>
          <Show when={openRouter.key}>
            <OpenRouterDisconnect />
          </Show>
        </div>
      </div>
    </main>
  )
}

