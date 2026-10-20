export class ProviderAuthError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Provider rejected the credentials (HTTP ${status})`);
    this.name = 'ProviderAuthError';
    this.status = status;
  }
}

export class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Provider answered HTTP ${status}`);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

export class ProviderPayloadError extends Error {
  constructor(detail: string) {
    super(`Unexpected provider payload: ${detail}`);
    this.name = 'ProviderPayloadError';
  }
}

export class ProviderNetworkError extends Error {
  readonly kind: 'timeout' | 'network_error';

  constructor(kind: 'timeout' | 'network_error', options?: ErrorOptions) {
    super(kind === 'timeout' ? 'Provider request timed out' : 'Provider request failed', options);
    this.name = 'ProviderNetworkError';
    this.kind = kind;
  }
}
