export class LockLostError extends Error {
  constructor() {
    super('Sync lock lost');
    this.name = 'LockLostError';
  }
}
