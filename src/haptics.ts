export const vibrate = (pattern: number | number[]) => {
  if (typeof window !== 'undefined' && 'navigator' in window && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors if vibrate isn't allowed or throws
    }
  }
};

export const hapticTap = () => vibrate(10);
export const hapticHeavy = () => vibrate([30, 50, 30]);
export const hapticCrash = () => vibrate([50, 100, 50, 100, 150]);
