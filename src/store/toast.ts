import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (message: string) => void
  hide: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    clearTimeout(timer)
    set({ message })
    timer = setTimeout(() => set({ message: null }), 3500)
  },
  hide: () => set({ message: null }),
}))
