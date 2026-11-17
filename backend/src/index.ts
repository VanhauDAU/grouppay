import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './middleware/groupAuth.js';
import { groupsRouter } from './modules/groups/routes.js';
import { membersRouter } from './modules/members/routes.js';
import { activitiesRouter } from './modules/activities/routes.js';
import { debtsRouter } from './modules/debts/routes.js';
import { paymentsRouter } from './modules/payments/routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { historyRouter } from './modules/history/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { exportsRouter } from './modules/exports/routes.js';
import { handleScheduledReminder } from './scheduled/reminder.js';

export { GroupRoomDO } from './durable-objects/GroupRoomDO.js';

const app = new Hono<AppEnv>();

// CORS middleware cho phép frontend kết nối linh hoạt
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Group-Code', 'X-Member-Id']
  })
);

// Health check
app.get('/', (c) => c.json({ name: 'TinhTien API', status: 'online', time: new Date().toISOString() }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// WebSocket upgrade endpoint chuyển tiếp đến Durable Object của nhóm
app.get('/api/groups/:groupCode/ws', async (c) => {
  const groupCode = c.req.param('groupCode');
  const memberId = c.req.query('memberId') || 'anonymous';

  // Lấy GroupRoom Durable Object tương ứng với group
  const doId = c.env.GROUP_ROOM.idFromName(groupCode);
  const roomStub = c.env.GROUP_ROOM.get(doId);

  const forwardUrl = new URL(c.req.url);
  forwardUrl.pathname = '/websocket';
  forwardUrl.searchParams.set('memberId', memberId);

  return roomStub.fetch(forwardUrl.toString(), c.req.raw);
});

// Gắn các routers theo module
app.route('/api/groups', groupsRouter);
app.route('/api/groups', membersRouter);
app.route('/api/groups', activitiesRouter);
app.route('/api/groups', debtsRouter);
app.route('/api/groups', paymentsRouter);
app.route('/api/groups', dashboardRouter);
app.route('/api/groups', historyRouter);
app.route('/api/groups', notificationsRouter);
app.route('/api/groups', exportsRouter);

// Error handler chuẩn hóa
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json(
    {
      success: false,
      error: err.message || 'Đã có lỗi xảy ra trên hệ thống máy chủ'
    },
    500
  );
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduledReminder(env));
  }
};
