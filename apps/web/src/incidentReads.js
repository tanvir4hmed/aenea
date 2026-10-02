// Separate lanes keep historical pagination from replacing live state. Every
// selection/session change invalidates outstanding results, including failures.
export function createRequestGate() {
  let version = 0;
  return {
    start() { const request = ++version; return () => request === version; },
    invalidate() { version += 1; },
  };
}

export function mergeEvidence(previous, incoming, append = false) {
  return append ? [...new Map([...previous, ...incoming].map(item => [item.sk, item])).values()] : incoming;
}
