// An error that maps to a specific HTTP status. The error handler sends `message` to the client.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Shared by real and stub providers so a simulated outage looks identical to a real one.
export function llmUnavailable(): HttpError {
  return new HttpError(503, "LLM service is unavailable");
}
