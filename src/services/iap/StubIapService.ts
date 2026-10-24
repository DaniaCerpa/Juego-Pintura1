import type { IapService } from './IapService';

/** Sin compras hasta F3. */
export class StubIapService implements IapService {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async purchase(): Promise<'ok' | 'cancelled' | 'failed'> {
    return 'failed';
  }
  async restore(): Promise<void> {
    /* nada */
  }
}
