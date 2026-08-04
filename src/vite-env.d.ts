export {}

declare global {
  interface Window {
    inframe: {
      getState: () => Promise<{
        targets: string[]
        url: string
        inbox: string
        installed: Record<string, boolean>
      }>
      setTargets: (targets: string[]) => Promise<string[]>
      navigate: (url: string) => Promise<string>
      goBack: () => Promise<void>
      goForward: () => Promise<void>
      reload: () => Promise<void>
      scanImages: () => Promise<Array<{ url: string; width: number; height: number; alt: string }>>
      insertImage: (url: string) => Promise<unknown>
      openInbox: (target?: string) => Promise<string>
      openExternal: (url: string) => Promise<void>
      openPluginInBrowser: (url: string) => Promise<string>
      getPlugins: () => Promise<
        Array<{
          id: string
          name: string
          apps: string[]
          category: string
          description: string
          url: string
          downloadUrl: string
        }>
      >
      setLayout: (layout: { left?: number; top?: number }) => void
      onBrowserUrl: (cb: (url: string) => void) => () => void
      onBrowserLoading: (cb: (loading: boolean) => void) => () => void
      onGuestInsert: (cb: (url: string) => void) => () => void
      onToast: (cb: (payload: { type: string; message: string; detail?: string }) => void) => () => void
    }
  }
}
