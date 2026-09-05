import { isoDate } from './format';

export function todayIso(): string {
  return isoDate(new Date());
}
