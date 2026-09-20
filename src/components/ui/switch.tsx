import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full bg-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-accent',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-[22px] w-[22px] rounded-full border-hair border-border-strong bg-white transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]" />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
