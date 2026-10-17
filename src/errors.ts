// An error that maps to a specific HTTP status. The error handler sends `message` to the client.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
