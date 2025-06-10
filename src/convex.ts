import { ConvexClient } from "convex/browser";
import { FunctionReference } from "convex/server";
import { createSignal, onCleanup } from "solid-js";

export const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL!);

export function useQuery<T>(
  query: FunctionReference<"query">,
  args?: {}
) {
  let fullArgs = args ?? {};
  let [data, setData] = createSignal<T | undefined>()
  const unsubber = convex!.onUpdate(query, fullArgs, (data) => {
    setData(data)
  });
  onCleanup(() => {
    unsubber?.()
  })
  return [data, setData]
}
