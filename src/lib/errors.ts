/** A problem with what the user sent (as opposed to a bug): the API answers 400 and shows the message. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
