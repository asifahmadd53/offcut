import { useToast } from '@/store/toast'

export function Toast() {
  const message = useToast((s) => s.message)
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto rounded-full bg-primary px-4 py-2.5 text-[14px] font-medium text-primary-foreground shadow-none"
      >
        {message}
      </div>
    </div>
  )
}
