// Svelte action for modal dialogs: moves focus inside, keeps Tab/Shift+Tab cycling
// within the node, and restores focus to the previously focused element on close.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function focusTrap(node) {
  const previous = document.activeElement
  const items = () => [...node.querySelectorAll(FOCUSABLE)]

  if (!node.contains(document.activeElement)) (items()[0] ?? node).focus()

  function onKeydown(e) {
    if (e.key !== 'Tab') return
    const list = items()
    if (!list.length) {
      e.preventDefault()
      return
    }
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
      e.preventDefault()
      first.focus()
    }
  }

  node.addEventListener('keydown', onKeydown)
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown)
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    },
  }
}
