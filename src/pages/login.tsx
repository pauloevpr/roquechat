import { Show } from "solid-js"
import { useConvex } from "../lib/convex/provider"
import { Navigate } from "@solidjs/router"
import { Button } from "../components/buttons"
import { GithubIcon } from "../components/icons"
import { Logo } from "../components/logo"


export function LoginPage() {
  let { auth } = useConvex()
  return (
    <>
      <Show when={auth.state === "authenticated"}>
        <Navigate href="/" />
      </Show>
      <div class="flex flex-col items-center justify-center h-screen bg-surface">
        <section class="w-full max-w-sm">
          <h1 class="sr-only">
            Welcome to RoqueChat
          </h1>
          <div class="flex justify-center py-6">
            <Logo />
          </div>
          <Button
            large
            fullWidth
            label="Continue with Github"
            style="neutral"
            onClick={() => auth.signIn("github")}
            icon={<GithubIcon class="size-5 mr-2" />}
          />
          <a href="https://github.com/pauloevpr/roquechat"
            aria-label="Link to Github repository"
            class="block text-on-surface-light text-center mt-6 text-sm"
            target="_blank">
            View source code
            <GithubIcon class="size-3 inline-block ml-2" />
          </a>
        </section>
      </div>
    </>
  )
}