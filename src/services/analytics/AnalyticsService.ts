export interface AnalyticsService {
  log(event: string, params?: Record<string, unknown>): void;
}
