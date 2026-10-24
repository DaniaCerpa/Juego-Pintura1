export interface IapService {
  isAvailable(): Promise<boolean>;
  purchase(productId: string): Promise<'ok' | 'cancelled' | 'failed'>;
  restore(): Promise<void>;
}
