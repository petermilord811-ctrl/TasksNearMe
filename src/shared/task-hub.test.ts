import { describe, expect, it } from 'vitest';
import { taskHubRedirect } from './task-hub';

const at = (path: string, query = '') => taskHubRedirect(path, new URLSearchParams(query));

describe('taskHubRedirect', () => {
  it('sends a board filtered on one category to its job hub, other filters kept', () => {
    expect(at('/austin/tasks', 'category=moving-help')).toBe('/austin/tasks/moving-help');
    expect(at('/austin/tasks/', 'category=moving-help&when=today&sort=newest')).toBe('/austin/tasks/moving-help?when=today&sort=newest');
    expect(at('/austin/tasks', 'when=today&category=yard-cleanup&type=leaves')).toBe('/austin/tasks/yard-cleanup?when=today&type=leaves');
  });

  it('leaves everything else alone', () => {
    expect(at('/austin/tasks')).toBeNull();
    expect(at('/austin/tasks', 'when=today')).toBeNull();
    // Not a category the platform knows: the board ignores it.
    expect(at('/austin/tasks', 'category=plumbing')).toBeNull();
    // Already a hub, a task page, the app's and staff's task lists.
    expect(at('/austin/tasks/moving-help', 'category=yard-cleanup')).toBeNull();
    expect(at('/tasks/assemble-a-desk', 'category=moving-help')).toBeNull();
    expect(at('/app/tasks', 'category=moving-help')).toBeNull();
    expect(at('/admin/tasks', 'category=moving-help')).toBeNull();
  });
});
