/**
 * The editor's debounced save, as a small unit: an edit schedules `run`, and a refused load (the editor shows a stand-in
 * workspace) blocks it. Blocking also cancels a save that is already waiting, so an edit made just before the refusal cannot
 * write the stand-in over the program the store holds. unblock() after the next successful load.
 */
export function createSaveScheduler(run: () => void, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let blocked = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  return {
    schedule() {
      if (blocked) return;
      cancel();
      timer = setTimeout(() => { timer = undefined; if (!blocked) run(); }, delayMs);
    },
    cancel,
    setBlocked(value: boolean) { blocked = value; if (value) cancel(); },
  };
}
