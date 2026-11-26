import type { WsServerFrame } from '@vietlearning/contracts/api';
import type { Conversation, ConnState, Message, SocialClient, SocialRest } from '../client/types';

/** Bản giả điều khiển được cho test (KHÔNG nằm trong bundle: chỉ test import). */
export function fakeClient(over: Partial<SocialRest> = {}, opts: { state?: ConnState } = {}) {
  const frameFns = new Set<(f: WsServerFrame) => void>();
  const stateFns = new Set<(s: ConnState) => void>();
  const realtime = {
    state: (opts.state ?? 'online') as ConnState,
    connect: () => undefined,
    close: () => undefined,
    on(fn: (f: WsServerFrame) => void) {
      frameFns.add(fn);
      return () => void frameFns.delete(fn);
    },
    onState(fn: (s: ConnState) => void) {
      stateFns.add(fn);
      return () => void stateFns.delete(fn);
    }
  };
  const never = (n: string) => () => Promise.reject(new Error('chưa giả lập ' + n));
  const rest: SocialRest = {
    me: never('me'),
    setHandle: never('setHandle'),
    declareAge: never('declareAge'),
    listConversations: never('listConversations'),
    listMessages: never('listMessages'),
    sendMessage: never('sendMessage'),
    markRead: async () => undefined,
    recall: async () => undefined,
    restore: async () => undefined,
    listFriendRequests: async () => ({ requests: [] }),
    createFriendRequest: never('createFriendRequest'),
    respondFriendRequest: async () => undefined,
    acceptInvite: never('acceptInvite'),
    blockUser: async () => undefined,
    report: never('report'),
    ...over
  };
  const client: SocialClient = { rest, realtime };
  return {
    client,
    rest,
    push: (f: WsServerFrame) => frameFns.forEach((fn) => fn(f)),
    setState: (s: ConnState) => {
      realtime.state = s;
      stateFns.forEach((fn) => fn(s));
    }
  };
}

export const ids = {
  c1: '11111111-1111-4111-8111-111111111111',
  c2: '22222222-2222-4222-8222-222222222222',
  c3: '33333333-3333-4333-8333-333333333333',
  u1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  u2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  m: (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
};

export const eligibleMe = {
  handle: 'minh',
  suggestedHandle: null,
  ineligible: null,
  settings: { discoverable: true, showOnline: true, showReadReceipts: true, showPushPreview: false }
} as const;

export const conv = (over: Partial<Conversation> & { id: string }): Conversation => ({
  kind: 'dm',
  title: null,
  peer: { id: ids.u2, displayName: 'Minh' },
  lastSeq: 1,
  unread: 0,
  muted: false,
  ...over
});

export const msg = (seq: number, over: Partial<Message> = {}): Message => ({
  id: ids.m(seq),
  cid: ids.c1,
  seq,
  sender: { id: ids.u2, displayName: 'Minh' },
  kind: 'text',
  body: `tin ${seq}`,
  createdAt: new Date(Date.UTC(2026, 10, 26, 9, seq)).toISOString(),
  mine: false,
  ...over
});
