import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { IconScissors } from '@tabler/icons-react'
import { useAuth } from '@/store/auth'
import { useData } from '@/store/data'
import { isFirebaseConfigured } from '@/lib/firebase'
import { Toaster } from 'sonner'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import NewJob from '@/pages/NewJob'
import Plan from '@/pages/Plan'
import LeftoverDetail from '@/pages/LeftoverDetail'
import JobDetail from '@/pages/JobDetail'
import ClientJobs from '@/pages/ClientJobs'
import SyncCheck from '@/pages/SyncCheck'
import Settings from '@/pages/Settings'
import Print from '@/pages/Print'
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-[14px] bg-warning-bg text-warning-text">
        <IconScissors size={26} />
      </div>
      <p className="mb-1 text-[18px] font-semibold">Setup needed</p>
      <p className="text-[15px] text-muted-foreground">
        Copy <code className="rounded bg-muted px-1 py-0.5 text-[13px]">.env.example</code> to{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-[13px]">.env</code> and fill in the six
        Firebase values: <code className="text-[13px]">VITE_FIREBASE_API_KEY</code>,{' '}
        <code className="text-[13px]">VITE_FIREBASE_AUTH_DOMAIN</code>,{' '}
        <code className="text-[13px]">VITE_FIREBASE_PROJECT_ID</code>,{' '}
        <code className="text-[13px]">VITE_FIREBASE_STORAGE_BUCKET</code>,{' '}
        <code className="text-[13px]">VITE_FIREBASE_MESSAGING_SENDER_ID</code>,{' '}
        <code className="text-[13px]">VITE_FIREBASE_APP_ID</code>.
      </p>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <img src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-[14px]" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status)
  if (status === 'loading') return <LoadingScreen />
  if (status === 'out') return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const status = useAuth((s) => s.status)
  const uid = useAuth((s) => s.uid)
  const start = useData((s) => s.start)
  const stop = useData((s) => s.stop)

  useEffect(() => {
    if (status === 'in' && uid) {
      start(uid)
      return () => stop()
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, uid])

  return (
    <Routes>
      <Route path="/login" element={status === 'in' ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/new" element={<RequireAuth><NewJob /></RequireAuth>} />
      <Route path="/plan" element={<RequireAuth><Plan /></RequireAuth>} />
      <Route path="/stock/:id" element={<RequireAuth><LeftoverDetail /></RequireAuth>} />
      <Route path="/job/:id" element={<RequireAuth><JobDetail /></RequireAuth>} />
      <Route path="/client/:clientId" element={<RequireAuth><ClientJobs /></RequireAuth>} />
      <Route path="/sync-check" element={<RequireAuth><SyncCheck /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/print/:jobId" element={<RequireAuth><Print /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const init = useAuth((s) => s.init)

  useEffect(() => {
    const stop = init()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isFirebaseConfigured) return <SetupNeeded />

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster
        position="top-center"
        theme="system"
        offset={16}
        duration={3000}
        visibleToasts={3}
        icons={{
          success: <IconCheck size={18} />,
          error: <IconX size={18} />,
          warning: <IconAlertTriangle size={18} />,
          info: <IconInfoCircle size={18} />,
        }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex w-full items-center gap-3 rounded-xl border-hair border-border bg-card px-4 py-3 text-foreground shadow-lg',
            icon: 'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground',
            content: 'min-w-0 flex-1',
            title: 'text-[15px] font-semibold leading-tight',
            description: 'mt-0.5 text-[13px] text-muted-foreground',
            actionButton:
              'rounded-lg bg-accent-text px-3 py-1.5 text-[13px] font-semibold text-background',
            cancelButton:
              'rounded-lg border-hair border-border px-3 py-1.5 text-[13px] font-semibold',
            success: '[&_[data-icon]]:bg-success-bg [&_[data-icon]]:text-success-text',
            error: '[&_[data-icon]]:text-danger-text',
            warning: '[&_[data-icon]]:text-warning-border',
          },
        }}
      />
    </BrowserRouter>
  )
}
