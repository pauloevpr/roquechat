import { Accessor, createMemo, JSX, ParentProps, splitProps, VoidProps } from "solid-js";
import { IconProps } from "./icons";

type ButtonStyle = "primary" | "neutral" | "primary-light"

// TODO: improver hover and active styles
// 

export function Button(props: ParentProps<{
  label: string
  style: ButtonStyle
  icon?: JSX.Element
  appendIcon?: JSX.Element
  fullWidth?: boolean
  large?: boolean
} & JSX.IntrinsicElements["button"]>) {
  let [_, otherProps] = splitProps(props, ["style", "label", "icon", "class", "classList"])
  const { base, classList } = useButtonStyle(() => props.style)
  return (
    <button class={base()}
      classList={classList()}
      {...otherProps}
      data-full-width={props.fullWidth}
      data-large={props.large}
    >
      {props.icon}
      {props.label}
      {props.appendIcon}
    </button>
  )
}

export function IconButton(props: ParentProps<{
  label: string
  icon: (props: IconProps) => JSX.Element
} & JSX.IntrinsicElements["button"]>) {
  // TODO: add tooltip on hover
  let [_, otherProps] = splitProps(props, ["aria-label", "style", "label", "icon", "class", "classList"])
  return (
    <button class="group/button size-10 flex items-center justify-center rounded-lg text-on-button-neutral active:bg-button-primary/20 hover:bg-button-primary/10"
      aria-label={props.label}
      {...otherProps}
    >
      <props.icon class="size-4 group-hover/button:text-primary" />
    </button>
  )
}

function useButtonStyle(style: Accessor<ButtonStyle>) {
  const base = `flex items-center justify-center gap-2 h-10 transition-colors font-semibold px-4 rounded-full whitespace-nowrap
                data-[full-width]:w-full data-[large]:h-12 data-[large]:text-lg data-[large]:px-6`
  const classList = createMemo(() => ({
    "bg-button-primary text-on-button-primary active:bg-button-primary/60 hover:bg-button-primary/80": style() === "primary",
    "bg-button-neutral/30 text-on-button-neutral active:bg-button-neutral/80 hover:bg-button-neutral/50": style() === "neutral",
    "bg-button-primary/10 text-primary active:bg-button-primary/40 hover:bg-button-primary/20": style() === "primary-light",
  }))
  return {
    base: (() => base) as Accessor<string>,
    classList,
  }
}