declare module "webpush-webcrypto" {
  export interface ApplicationServerKeysJSON {
    publicKey: string;
    privateKey: string;
  }

  export class ApplicationServerKeys {
    static generate(): Promise<ApplicationServerKeys>;
    static fromJSON(json: ApplicationServerKeysJSON): Promise<ApplicationServerKeys>;
    toJSON(): Promise<ApplicationServerKeysJSON>;
  }

  export interface PushTarget {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  export interface GeneratePushHTTPRequestOptions {
    applicationServerKeys: ApplicationServerKeys;
    payload: string;
    target: PushTarget;
    adminContact: string;
    ttl?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  }

  export interface GeneratedPushHTTPRequest {
    headers: Record<string, string>;
    body: BodyInit;
    endpoint: string;
  }

  export function generatePushHTTPRequest(
    options: GeneratePushHTTPRequestOptions,
  ): Promise<GeneratedPushHTTPRequest>;

  export function setWebCrypto(crypto: Crypto): void;
}
