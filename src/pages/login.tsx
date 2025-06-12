import { Show } from "solid-js"
import { useConvex } from "../lib/convex/provider"
import { Navigate } from "@solidjs/router"


export function LoginPage() {
  let { auth } = useConvex()
  return (
    <>
      <Show when={auth.state === "authenticated"}>
        <Navigate href="/" />
      </Show>
      <div class="flex flex-col items-center justify-center h-screen">
        <button
          class="bg-blue-500 text-white px-4 py-2 rounded-md"
          onClick={() => auth.signIn("github")}>
          Sign In with Github
        </button>
      </div>
    </>
  )
}