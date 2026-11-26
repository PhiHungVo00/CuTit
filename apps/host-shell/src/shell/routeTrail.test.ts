import { beforeEach, describe, expect, it } from 'vitest';
import { feedbackRouteInfo, recordRoute, resetRouteTrail } from './routeTrail';

beforeEach(resetRouteTrail);

describe('routeTrail (5 đường dẫn gần nhất cho Góp ý)', () => {
  it('chưa đi đâu => route "/" và danh sách rỗng', () => {
    expect(feedbackRouteInfo()).toEqual({ route: '/', recentRoutes: [] });
  });
  it('route = màn trước khi vào Góp ý; tối đa 5 đường dẫn, bỏ trùng liên tiếp', () => {
    for (const p of ['/', '/', '/bai-hoc/u1l1', '/ho-so', '/tien-do', '/ban-be', '/cai-dat']) recordRoute(p);
    const info = feedbackRouteInfo();
    expect(info.route).toBe('/cai-dat');
    expect(info.recentRoutes).toEqual(['/bai-hoc/u1l1', '/ho-so', '/tien-do', '/ban-be', '/cai-dat']);
  });
  it('không ghi các màn Góp ý; không bao giờ giữ tham số truy vấn hay #', () => {
    recordRoute('/ho-so');
    recordRoute('/gop-y');
    recordRoute('/gop-y/cua-toi');
    recordRoute('/tien-do?token=abc#x');
    expect(feedbackRouteInfo()).toEqual({ route: '/tien-do', recentRoutes: ['/ho-so', '/tien-do'] });
  });
});
