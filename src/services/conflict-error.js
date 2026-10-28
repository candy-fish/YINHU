export class ConflictError extends Error {
  constructor(message, remote = null) {
    super(message);
    this.name = 'ConflictError';
    this.code = 'VERSION_CONFLICT';
    this.remote = remote;
  }
}
