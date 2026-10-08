/** Debug logging — stripped from production bundles when __DEV__ is false. */
export function devLog(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}
