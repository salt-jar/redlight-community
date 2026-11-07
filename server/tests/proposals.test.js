import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers/context.js';

describe('群聊提案', () => {
  let ctx;
  let alice;
  let bob;

  beforeEach(async () => {
    ctx = await createTestContext('proposals');
    alice = await ctx.register('proposal-alice@example.com');
    bob = await ctx.register('proposal-bob@example.com');
  });

  afterEach(async () => {
    await ctx.close();
  });

  function auth(token) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createProposal(token, overrides = {}) {
    return ctx.agent
      .post('/api/proposals')
      .set(auth(token))
      .send({
        title: '关于改进理论学习小组的建议',
        proposalTime: '2026-11-10T19:30',
        proposerInfo: '同志_alice · 社区号 123456',
        content: '建议每周组织一次理论学习，并提前发布阅读材料。',
        ...overrides,
      });
  }

  it('提案接口需要登录，校验标题、时间、发起人信息与正文', async () => {
    expect((await ctx.agent.get('/api/proposals')).status).toBe(401);
    expect((await createProposal('')).status).toBe(401);

    const missingTitle = await createProposal(alice.token, { title: '短' });
    expect(missingTitle.status).toBe(400);
    const missingTime = await createProposal(alice.token, { proposalTime: '' });
    expect(missingTime.status).toBe(400);
    const missingInfo = await createProposal(alice.token, { proposerInfo: '' });
    expect(missingInfo.status).toBe(400);
    const shortContent = await createProposal(alice.token, { content: '太短' });
    expect(shortContent.status).toBe(400);
  });

  it('创建提案并出现在列表与详情中，发起人信息正确', async () => {
    const created = await createProposal(alice.token);
    expect(created.status).toBe(201);
    expect(created.body.proposal).toMatchObject({
      title: '关于改进理论学习小组的建议',
      proposalTime: '2026-11-10T19:30',
      proposerInfo: '同志_alice · 社区号 123456',
    });
    expect(created.body.proposal.user.id).toBe(alice.user.id);
    expect(created.body.proposal.user.nickname).toBe(alice.user.nickname);

    const list = await ctx.agent.get('/api/proposals').set(auth(bob.token));
    expect(list.status).toBe(200);
    expect(list.body.list[0].id).toBe(created.body.proposal.id);

    const detail = await ctx.agent
      .get(`/api/proposals/${created.body.proposal.id}`)
      .set(auth(bob.token));
    expect(detail.status).toBe(200);
    expect(detail.body.proposal.content).toContain('理论学习');
  });

  it('提案按最新创建顺序排列，并支持多条提案', async () => {
    const first = await createProposal(alice.token, { title: '第一条提案' });
    const firstId = first.body.proposal.id;
    const second = await createProposal(bob.token, { title: '第二条提案' });
    await createProposal(alice.token, { title: '第三条提案' });

    const list = await ctx.agent.get('/api/proposals').set(auth(alice.token));
    expect(list.body.list.map((item) => item.title)).toEqual(['第三条提案', '第二条提案', '第一条提案']);
    expect(list.body.list.find((item) => item.id === firstId)).toBeTruthy();
    expect(list.body.list.find((item) => item.id === second.body.proposal.id)).toBeTruthy();
  });

  it('被封锁用户发起的提案从普通用户列表隐藏', async () => {
    const created = await createProposal(alice.token);
    await ctx.deps.db.query('UPDATE users SET status = 0 WHERE id = ?', [alice.user.id]);

    const list = await ctx.agent.get('/api/proposals').set(auth(bob.token));
    expect(list.body.list.some((item) => item.id === created.body.proposal.id)).toBe(false);

    await ctx.deps.db.query('UPDATE users SET status = 1 WHERE id = ?', [alice.user.id]);
    const restored = await ctx.agent.get('/api/proposals').set(auth(bob.token));
    expect(restored.body.list.some((item) => item.id === created.body.proposal.id)).toBe(true);
  });
});
