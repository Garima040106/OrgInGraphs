export function createSubmissionLock() {
  let pending = false;
  return {
    acquire(): (() => void) | undefined {
      if (pending) return undefined;
      pending = true;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        pending = false;
      };
    },
  };
}
