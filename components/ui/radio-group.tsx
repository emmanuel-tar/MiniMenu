import * as React from "react"
import { cn } from "@/lib/utils"

type RadioOptionProps = {
  value: string
  id?: string
  className?: string
}

type RadioGroupProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children?: React.ReactNode
}

function RadioGroup({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: RadioGroupProps) {
  // Hide internal props from TS by providing the concrete child prop type
  type ChildProps = RadioGroupItemProps & RadioOptionProps;

  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? ""
  )

  const selectedValue = isControlled ? value : uncontrolledValue

  const setSelected = (next: string) => {
    if (!isControlled) setUncontrolledValue(next)
    onValueChange?.(next)
  }

  return (
    <div className={cn(className)} data-selected={selectedValue}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        const childValue = (child.props as RadioOptionProps).value
        const checked = childValue === selectedValue
        return React.cloneElement(child, {
          checked,
          onSelect: () => setSelected(childValue),
        })
      })}
    </div>
  )
}

type RadioGroupItemProps = {
  value: string
  id?: string
  className?: string
  checked?: boolean
  onSelect?: () => void
}

function RadioGroupItem({ value, id, className, checked, onSelect }: RadioGroupItemProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={value}
      id={id}
      onClick={onSelect}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white transition",
        "h-5 w-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
        checked ? "border-slate-900" : "border-slate-300",
        className
      )}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full bg-slate-900 transition-opacity",
          checked ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  )
}

export { RadioGroup, RadioGroupItem }


