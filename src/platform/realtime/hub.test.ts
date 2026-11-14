import { describe, expect, it, vi } from 'vitest';
import { MAX_ENVELOPE_BYTES, marketChannel, parseEnvelope, RealtimeHub, userChannel } from './hub';

describe('the realtime hub', () => {
  it('hands a notice to the streams on its channel only, and stops after unsubscribing', () => {
    const hub = new RealtimeHub();
    const maya = vi.fn();
    const jordan = vi.fn();
    const stop = hub.subscribe(userChannel('usr_maya'), maya);
    hub.subscribe(userChannel('usr_jordan'), jordan);
    expect(hub.emit({ channel: userChannel('usr_maya'), notice: { type: 'message', thread: 'thr_1' } })).toBe(1);
    expect(maya).toHaveBeenCalledWith({ type: 'message', thread: 'thr_1' });
    expect(jordan).not.toHaveBeenCalled();
    stop();
    expect(hub.emit({ channel: userChannel('usr_maya'), notice: { type: 'message', thread: 'thr_1' } })).toBe(0);
    expect(hub.count()).toBe(1);
    expect(hub.count(userChannel('usr_maya'))).toBe(0);
  });

  it('keeps delivering when one stream throws', () => {
    const hub = new RealtimeHub();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    hub.subscribe(marketChannel('mkt_austin'), () => {
      throw new Error('closed');
    });
    hub.subscribe(marketChannel('mkt_austin'), good);
    expect(hub.emit({ channel: marketChannel('mkt_austin'), notice: { type: 'task.posted', task: 'tsk_1' } })).toBe(1);
    expect(good).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe('notice envelopes from Postgres', () => {
  it('accepts a channel and a notice of ids', () => {
    expect(parseEnvelope(JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'typing', thread: 'thr_1' } }))).toEqual({ channel: 'user:usr_maya', notice: { type: 'typing', thread: 'thr_1' } });
  });

  it('drops anything else: unknown channels, nested values, long text, bad types, oversized payloads', () => {
    const bad = [
      'not json',
      JSON.stringify({ channel: 'admin:all', notice: { type: 'message' } }),
      JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'message', body: { text: 'hi' } } }),
      JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'message', body: 'x'.repeat(121) } }),
      JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'Message!' } }),
      JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'message', 'Bad-Key': 'x' } }),
      JSON.stringify({ channel: 'user:usr_maya', notice: [] }),
      JSON.stringify({ channel: 'user:usr_maya', notice: { type: 'message', pad: 'x'.repeat(MAX_ENVELOPE_BYTES) } }),
    ];
    for (const payload of bad) expect(parseEnvelope(payload), payload.slice(0, 60)).toBeNull();
  });
});
