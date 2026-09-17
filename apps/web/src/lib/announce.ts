export function announce(message: string): void {
  const el = document.getElementById('status-announcer')
  if (el) {
    el.textContent = message
  }
}
