import type { PushProvider } from './PushProvider.js';
import type { PushMessage } from './payload.js';

/** Dev/test: chỉ ghi gọn ra log (KHÔNG ghi token, KHÔNG ghi nội dung tin). */
export class LogPushProvider implements PushProvider {
  readonly name = 'log';
  constructor(private readonly log: { info: (obj: object, msg?: string) => void }) {}
  async send(tokens: string[], msg: PushMessage): Promise<{ invalid: string[] }> {
    this.log.info({ tokens: tokens.length, type: msg.data.type, channel: msg.channel, priority: msg.priority, collapseKey: msg.collapseKey }, 'push (log provider)');
    return { invalid: [] };
  }
}
