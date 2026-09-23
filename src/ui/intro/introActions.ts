export const introActions = {
  // Starts the game (fly-in to the home spawn); `after` runs once it's live.
  handleEnter:       null as ((after?: () => void) => void) | null,
  collapseProgress:  null as ((onDone: () => void) => void) | null,
  startReveal:       null as (() => void) | null,
  expandReveal:      null as ((onComplete?: () => void) => void) | null,
  onHoverEnter:      null as (() => void) | null,
  onHoverLeave:      null as (() => void) | null,
  ready: false,
}
