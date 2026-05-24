interface BuildState {
  running: boolean
  startedAt: string | null
  attributionDays: number | null
}

let state: BuildState = { running: false, startedAt: null, attributionDays: null }

export const buildLock = {
  acquire(days: number): boolean {
    if (state.running) return false
    state = { running: true, startedAt: new Date().toISOString(), attributionDays: days }
    return true
  },
  release(): void {
    state = { running: false, startedAt: null, attributionDays: null }
  },
  get(): BuildState {
    return { ...state }
  },
}
