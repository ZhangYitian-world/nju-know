import test from 'node:test';
import assert from 'node:assert/strict';
import { healthView, beijingTime, sourceStatusLabel } from '../web/lib/wechat-health.ts';

const last = Date.parse('2026-10-29T09:00:00Z');
const health = { version: 1, status: 'ok', checked_at: '2026-10-29T09:00:00Z', last_success_at: '2026-10-29T09:00:00Z', total_sources: 47, succeeded_sources: 47, failed_sources: 0, resumed_sources: 0, fetched_count: 376, new_count: 0, consecutive_failures: 0 };

test('a deferred source is not displayed as an attempted request failure', () => {
  assert.match(sourceStatusLabel({ status: 'pending', error_reason: 'rate_limited' }), /本轮未请求/);
  assert.match(sourceStatusLabel({ status: 'unavailable', error_reason: 'rate_limited' }), /请求受限/);
});

test('an old static page becomes stale using the visitors clock even without a rebuild', () => {
  assert.equal(healthView(health, last + 3600_000).level, 'ok');
  assert.equal(healthView(health, last + 8 * 3600_000 + 1).level, 'warning');
  assert.match(healthView(health, last + 9 * 3600_000).label, /8 小时/);
});

test('auth, verification and rate limiting have separate messages', () => {
  assert.equal(healthView({ ...health, status: 'auth_required' }, last).level, 'error');
  assert.match(healthView({ ...health, status: 'verification_required' }, last).label, /微信验证/);
  assert.match(healthView({ ...health, status: 'rate_limited' }, last).label, /上游限制/);
  assert.match(healthView({ ...health, status: 'partial', succeeded_sources: 46, failed_sources: 1 }, last).label, /46\/47/);
});

test('missing success dates do not claim normal syncing and times use Beijing', () => {
  assert.equal(healthView(null, last).level, 'unknown');
  assert.equal(healthView({ ...health, last_success_at: '' }, last).level, 'unknown');
  assert.match(beijingTime('2026-10-29T09:00:00Z'), /17:00/);
});

test('daily collection tolerates a normal overnight wait before the 32-hour warning', () => {
  const daily = { ...health, interval_hours: 24, stale_after_hours: 32 };
  assert.equal(healthView(daily, last + 25 * 3600_000).level, 'ok');
  assert.match(healthView(daily, last + 33 * 3600_000).label, /32 小时/);
});

test('coverage combines separate rounds and drops each success when it leaves the 48-hour window', () => {
  const earlier = new Date(last - 48 * 3600_000).toISOString();
  const recent = new Date(last).toISOString();
  const partial = { ...health, status: 'partial', total_sources: 3, succeeded_sources: 2,
    source_last_success_at: [earlier, recent, recent] };
  assert.deepEqual(healthView(partial, last), { level: 'ok', label: '最近成功：3/3（近 48 小时）' });
  assert.deepEqual(healthView(partial, last + 1), { level: 'warning', label: '最近成功：2/3（近 48 小时）' });
  assert.match(healthView({ ...partial, status: 'auth_required' }, last).label, /重新授权.*3\/3/);
});
