// Нативный модуль: слежение за переключателем геолокации во время смены (только Android).
// В Expo Go и на iOS модуля нет — тогда null, и приложение работает по-старому.
import { NativeModule, requireOptionalNativeModule } from 'expo';

type Events = {
  onLocationToggle(event: { enabled: boolean }): void;
};

declare class ShiftGuardModule extends NativeModule<Events> {
  isLocationEnabled(): boolean;
  /** title/body — текст предупреждения на языке приложения (нативный код не знает переводов). */
  startWatching(title: string, body: string): void;
  stopWatching(): void;
  showLocationOff(title: string, body: string): void;
  hideLocationOff(): void;
  /** Канал уведомления службы без счётчика на иконке. До запуска службы. */
  prepareServiceChannel(taskName: string): void;
}

export const ShiftGuard = requireOptionalNativeModule<ShiftGuardModule>('ShiftGuard');
