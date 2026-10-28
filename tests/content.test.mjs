import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../web/lib/classify.ts';
import { canonicalUrl, cleanSummary, mergeStories, sameStory } from '../web/lib/dedupe.ts';

function item(title, overrides = {}) {
  const result = {
    id: 'a', title, organizer: '文学院', channel: '官网', kind: '通知', category: '校园',
    date: '2026-10-28', time: '', cover: '', deadline: '', needsSignup: false,
    summary: '', url: 'https://chin.nju.edu.cn/tzgg/20261028/i123.html', ...overrides,
  };
  return { ...result, channels: [result.channel], origins: [{ title: result.title, organizer: result.organizer, channel: result.channel, url: result.url, date: result.date }] };
}

test('staff recruiting is not student employment, student campus recruiting remains employment', () => {
  assert.deepEqual(classify('南京大学商学院2026年度准聘长聘岗位（事业编制）招聘公告', '商学院', '活动'), { kind: '通知', category: '院系' });
  assert.deepEqual(classify('南京大学商学院2026年度研究系列人员招聘公告', '商学院', '活动'), { kind: '通知', category: '院系' });
  assert.deepEqual(classify('英伟芯科技2027届全球校园招聘正式启动', '南大就业', '通知'), { kind: '活动', category: '就业' });
});

test('recaps stop entering live activity sections; previews remain live', () => {
  assert.deepEqual(classify('访企拓岗 | 创智鼓楼·脑机前沿——走进南京大学脑机接口研究院', 'NJUAI研会', '通知'), { kind: '通知', category: '科研' });
  assert.deepEqual(classify('讲座预告：国际传播与数字社会', '新闻传播学院', '活动'), { kind: '活动', category: '讲座' });
  assert.equal(classify('国际传播论坛', '新闻传播学院', '活动', '论坛将于下周举行').kind, '活动');
  assert.equal(classify('国际传播论坛', '新闻传播学院', '活动', '此次论坛成功举办，师生共同参与').kind, '通知');
});

test('credits are not displayed as a synopsis', () => {
  assert.equal(cleanSummary('编辑 | 李佳怡 责编 | 杨越'), '');
  assert.equal(cleanSummary('报名时间为  10月28日。'), '报名时间为 10月28日。');
});

test('graduate studies and award results are not research or live activities', () => {
  assert.deepEqual(classify('关于开展2025级硕士研究生中期考核的通知', '研究生院', '通知'), { kind: '通知', category: '学业' });
  assert.deepEqual(classify('商学院2027年硕士研究生招生参考书目', '商学院', '通知'), { kind: '通知', category: '学业' });
  assert.equal(classify('模拟法庭竞赛奖金获奖名单公示', '法学院', '活动').kind, '通知');
  assert.deepEqual(classify('关于2027年春季台北大学交流项目申请的通知', '政府管理学院', '通知'), { kind: '活动', category: '留学' });
});

test('canonical URLs discard trackers, but preserve WeChat article identifiers', () => {
  assert.equal(canonicalUrl('http://cs.nju.edu.cn/ed/0c/c1706a847116/page.htm?utm_source=x#top'), 'https://cs.nju.edu.cn/ed/0c/c1706a847116/page.htm');
  const a = canonicalUrl('https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=1&sn=foo&scene=21');
  const b = canonicalUrl('https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=2&sn=bar&scene=21');
  assert.notEqual(a, b);
  assert.ok(a.includes('idx=1'));
});

test('same story merges with cover and all original channels retained', () => {
  const a = item('2026年11月6-7日普通话水平测试网络报名通知');
  const b = item('【转发】2026年11月6—7日普通话水平测试网络报名通知', { id: 'b', organizer: '南大青年', channel: '公众号', url: 'https://mp.weixin.qq.com/s/abc', cover: 'https://mmbiz.qpic.cn/public.jpg' });
  const merged = mergeStories([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].origins.length, 2);
  assert.deepEqual(merged[0].channels, ['官网', '公众号']);
  assert.equal(merged[0].url, a.url);
  assert.equal(merged[0].cover, b.cover);
});

test('identical generic notices from different colleges are distinct', () => {
  const a = item('2026年研究生国家奖学金拟推荐名单公示');
  const b = item(a.title, { organizer: '化学学院', url: 'https://chem.nju.edu.cn/eb/7b/c12641a846715/page.htm' });
  assert.equal(sameStory(a, b), false);
  assert.equal(mergeStories([a, b]).length, 2);
});

test('near-identical cohosted event reposts merge, distinct rounds and old editions do not', () => {
  const a = item('巧手做月饼，欢乐迎中秋｜健雄书院x开甲书院联合举办中秋联谊游园会', { organizer: '南京大学健雄书院' });
  const b = item('巧手做月饼，欢乐迎中秋｜开甲书院×健雄书院联合举办中秋联谊游园会', { organizer: '南京大学开甲书院', url: 'https://mp.weixin.qq.com/s/different' });
  assert.equal(sameStory(a, b), true);
  assert.equal(sameStory(item('讲座预告：第七期世界古典学与知识生产专题学术论坛'), item('讲座预告：第八期世界古典学与知识生产专题学术论坛', { url: 'https://cs.nju.edu.cn/info/1/2.htm' })), false);
  assert.equal(sameStory(a, { ...b, date: '2026-09-01' }), false);
});
