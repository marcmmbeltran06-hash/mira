// Clock.ts
import { Timestamp } from './Timestamp';

export interface Clock {
  now(): Timestamp;
}

export class SystemClock implements Clock {
  now(): Timestamp {
    return Timestamp.now();
  }
}
