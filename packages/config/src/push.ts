export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  send(token: string, payload: PushPayload): Promise<void>;
  sendMulticast(tokens: string[], payload: PushPayload): Promise<void>;
}

export class NoOpPushProvider implements PushProvider {
  async send(token: string, payload: PushPayload): Promise<void> {
    console.log(`[push] send to ${token}: ${payload.title}`);
  }

  async sendMulticast(tokens: string[], payload: PushPayload): Promise<void> {
    console.log(`[push] multicast to ${tokens.length} tokens: ${payload.title}`);
  }
}

export function createPushProvider(): PushProvider {
  return new NoOpPushProvider();
}
