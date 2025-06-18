import { Show } from "solid-js"
import { useConvex } from "../lib/convex/provider"
import { Navigate } from "@solidjs/router"
import { Button } from "../components/buttons"
import { GithubIcon } from "../components/icons"


export function LoginPage() {
  let { auth } = useConvex()
  return (
    <>
      <Show when={auth.state === "authenticated"}>
        <Navigate href="/" />
      </Show>
      <div class="flex flex-col items-center justify-center h-screen bg-surface">
        <section class="w-full max-w-sm">
          <h1 class="text-xl font-medium text-center py-6">
            Welcome to RoqueChat
          </h1>
          <Button
            large
            fullWidth
            label="Continue with Github"
            style="neutral"
            onClick={() => auth.signIn("github")}
            icon={<GithubIcon class="size-5 mr-2" />}
          />
        </section>
      </div>
    </>
  )
}