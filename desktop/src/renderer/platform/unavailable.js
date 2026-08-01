// @ts-check

function unavailable(capability) {
  throw new Error(`${capability} is not available in the secure host slice.`);
}

export function createUnavailableNetworkAdapter() {
  return Object.freeze({ request() { return unavailable("network"); } });
}

export function createUnavailableFileAdapter() {
  return Object.freeze({ select() { return unavailable("file"); } });
}
