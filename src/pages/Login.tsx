import { IconScissors, IconWifiOff } from '@tabler/icons-react'

/** Full Login/Register screen is built in Stage 4. This is a Stage 2 placeholder shown when logged out. */
export default function Login() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-4">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[14px] bg-accent-bg text-accent-text">
          <IconScissors size={26} />
        </div>
        <p className="font-sans text-[22px] font-semibold">Offcut</p>
        <p className="text-[14px] text-muted-foreground">Plan cuts. Reuse every leftover.</p>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[12px] text-faint">
        <IconWifiOff size={14} />
        Works offline after your first login
      </div>
    </div>
  )
}
