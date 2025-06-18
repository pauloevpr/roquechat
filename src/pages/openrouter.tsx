import { useNavigate, useSearchParams } from "@solidjs/router";
import { createMemo, createEffect, Show } from "solid-js";
import { Button } from "../components/buttons";
import { OpenRouterIcon } from "../components/icons";
import { useOpenRouter } from "../lib/openrouter";


export function useOpenRouterSetup() {
  let navigate = useNavigate();
  let [searchParams, setSearchParams] = useSearchParams();
  let open = createMemo(() => searchParams.select === "true");
  let dialogRef = undefined as undefined | HTMLDialogElement;

  createEffect(() => {
    if (open()) {
      dialogRef?.showModal();
    } else {
      dialogRef?.close();
    }
  });

  function show() {
    setSearchParams({ ...searchParams, select: "true" });
  }

  function close() {
    navigate(-1);
  }

  function onDialogKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  function Dialog() {
    return (
      <>
        <dialog
          ref={dialogRef}
          classList={{
            "hidden": !open(),
            "z-10 fixed top-0 left-0 min-w-screen min-h-screen bg-surface": open(),
          }}
          onKeyDown={onDialogKeyDown}>
          <div class="flex justify-center h-screen w-screen pt-32">
            <div class="max-w-sm w-full">
              <OpenRouterConnect onCancel={close} />
            </div>
          </div>
        </dialog>
      </>
    );
  }

  return { OpenRouterSetupDialog: Dialog, showOpenRouterSetup: show };
}


export function OpenRouterConnect(props: { onCancel?: Function }) {
  let openRouter = useOpenRouter();

  return (
    <div class="px-6 sm:px-0">
      <div class="flex gap-2 items-center w-full">
        <OpenRouterIcon class="size-8" />
        <span class="font-medium text-2xl">OpenRouter</span>
      </div>
      <section class="pt-6">
        <header class="sr-only">Connect OpenRouter</header>
        <p class="text-on-surface-light text-lg">Unlock hundreds of models through OpenRouter from multiple vendors like OpenAI, Anthropic, Google, DeepSeek and many more.</p>
        <Show when={openRouter.error}>
          <p class="text-red-600 py-4 px-6 py-4 rounded-xl mt-4">
            OpenRouter integration failed: {openRouter.error}
          </p>
        </Show>
        <div class="space-y-2 pt-6">
          <Button
            label="Connect OpenRouter"
            style="primary"
            large
            fullWidth
            onClick={openRouter.connect}
            icon={<OpenRouterIcon class="size-4" />} />
          <Show when={props.onCancel}>
            {onCancel => (
              <Button
                fullWidth
                large
                style="neutral"
                label="Cancel"
                onClick={() => onCancel()()} />
            )}
          </Show>
        </div>
        <details class="text-on-surface-light pt-6 px-2">
          <summary class="mx-auto">How is my API Key used?</summary>
          <p class="block pt-4">
            Once you connect your OpenRouter account, your OpenRouter API Key will be stored in your browser only. When chatting with the models, your API Key will be sent with every request, and it will safely travel through our servers. Your API Key is never logged or stored anywhere in our servers.
            {" "}<a class="text-primary font-medium" href="https://github.com/pauloevpr/roquechat" target="_blank">Learn More.</a>
          </p>
        </details>
      </section>
    </div>
  );
}

export function OpenRouterDisconnect() {
  let openRouter = useOpenRouter();

  function disconnect() {
    let confirmed = confirm("You are about to disconnect your OpenRouter account. Confirm?")
    if (!confirmed) return
    openRouter.disconnect();
  }

  return (
    <div class="px-6 sm:px-0">
      <div class="flex gap-2 items-center w-full">
        <OpenRouterIcon class="size-8" />
        <span class="font-medium text-2xl">OpenRouter</span>
        <span class="block ml-2 bg-primary-light-2 px-2 py-1 rounded-full text-primary font-medium text-sm">Connected</span>
      </div>
      <section class="pt-6">
        <header class="sr-only">Connect OpenRouter</header>
        <p class="text-on-surface-light">
          Your OpenRouter account is connected. You now have access to hundreds of models.
        </p>
        <Show when={openRouter.error}>
          <p class="text-red-600 py-4 px-6 py-4 rounded-xl mt-4">
            OpenRouter integration failed: {openRouter.error}
          </p>
        </Show>
        <div class="space-y-2 pt-6">
          <Button
            label="Disconnect OpenRouter"
            style="neutral"
            large
            fullWidth
            onClick={disconnect}
            icon={<OpenRouterIcon class="size-4" />} />
        </div>
        <details class="text-on-surface-light pt-6 px-2">
          <summary class="mx-auto">How is my API Key used?</summary>
          <p class="block pt-4">
            Once you connect your OpenRouter account, your OpenRouter API Key will be stored in your browser only. When chatting with the models, your API Key will be sent with every request, and it will safely travel through our servers. Your API Key is never logged or stored anywhere in our servers.
            {" "}<a class="text-primary font-medium" href="https://github.com/pauloevpr/roquechat" target="_blank">Learn More.</a>
          </p>
        </details>
      </section>
    </div>
  );
}