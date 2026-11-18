import { describe, expect, it } from 'vitest';
import { deskExactAddress } from '@/fixtures';
import { routes } from './routes';

describe('routes', () => {
  it('builds app paths with encoded segments and query strings', () => {
    expect(routes.app.booking('bkg_1')).toBe('/app/bookings/bkg_1');
    expect(routes.app.requestHelper('jordan-t', { fromBookingId: 'bkg_1' })).toBe(
      '/app/helpers/jordan-t/request?from=booking%3Abkg_1',
    );
    expect(routes.app.offers()).toBe('/app/offers');
    expect(routes.app.offers('inv_9')).toBe('/app/offers?invite=inv_9');
    expect(routes.signIn('/app/tasks/new')).toBe('/sign-in?next=%2Fapp%2Ftasks%2Fnew');
    // The landing page's assistant: the words, the kind of help, and "Draft it with AI".
    expect(routes.app.newTask({ category: 'moving-help', describe: 'load a truck', ai: true })).toBe('/app/tasks/new?category=moving-help&describe=load+a+truck&ai=1');
    expect(routes.app.newTask({ describe: 'load a truck', ai: false })).toBe('/app/tasks/new?describe=load+a+truck');
    // "Use this draft" after "Write it with AI": the title too.
    expect(routes.app.newTask({ category: 'moving-help', title: 'Load a 10 ft truck', describe: 'Two hours.' })).toBe('/app/tasks/new?category=moving-help&title=Load+a+10+ft+truck&describe=Two+hours.');
    // "Ask for help" (plan 9.10): the post's id only; the server reads its words.
    expect(routes.app.newTask({ fromPost: 'cpo_desk' })).toBe('/app/tasks/new?from=cpo_desk');
  });

  it('puts task board filters in the URL and leaves defaults out', () => {
    // The default market is the first city (Gainesville since 2026-11-17).
    expect(routes.taskBoard()).toBe('/gainesville/tasks');
    expect(routes.taskBoard('austin', { when: 'any', sort: 'soonest', page: 1, remoteOnly: false })).toBe('/austin/tasks');
    // One category is its job hub, with the other filters as parameters.
    expect(
      routes.taskBoard('austin', { category: 'moving-help', when: 'this_weekend', remoteOnly: true, sort: 'newest', page: 3 }),
    ).toBe('/austin/tasks/moving-help?when=this_weekend&remote=1&sort=newest&page=3');
    expect(routes.taskBoard('austin', { category: 'moving-help', type: 'load_truck' })).toBe('/austin/tasks/moving-help?type=load_truck');
    expect(routes.taskBoard('austin', { type: 'load_truck' })).toBe('/austin/tasks');
    expect(routes.costGuide('furniture-assembly')).toBe('/gainesville/furniture-assembly/cost');
    expect(routes.app.findWorkTask('tsk_desk')).toBe('/app/find-work/tsk_desk');
    expect(routes.app.findWork()).toBe('/app/find-work');
    expect(routes.app.findWork({ distance: 'any', when: 'any', page: 1 })).toBe('/app/find-work');
    expect(routes.app.findWork({ category: 'yard-cleanup', remoteOnly: true, page: 2, distance: 'within_5_mi' })).toBe(
      '/app/find-work?category=yard-cleanup&remote=1&page=2&distance=within_5_mi',
    );
  });

  it('keeps preview ids as path segments', () => {
    expect(routes.dev.preview('price-breakdown/desk-poster')).toBe('/dev/ui/price-breakdown/desk-poster');
  });

  it('builds a Google Maps search link without access notes', () => {
    const href = routes.external.googleMapsSearch(deskExactAddress);
    expect(href).toBe(
      'https://www.google.com/maps/search/?api=1&query=1234%20Example%20Lane%2C%20Apt%202B%2C%20Austin%2C%20TX%2078723',
    );
    expect(href).not.toContain('Buzz');
  });
});

describe('the neighborhood portal (plan 9.10)', () => {
  it('leaves the defaults out and keeps one order, so the same filters make the same URL', () => {
    expect(routes.app.community()).toBe('/app/community');
    expect(routes.app.community({ sort: 'hot', view: 'feed', group: 'area', saved: false, page: 1 })).toBe('/app/community');
    expect(routes.app.community({ page: 2, view: 'list', sort: 'new', saved: true, q: ' leaf  bags ', time: '7d', type: 'task', category: 'yard-cleanup', area: 'mueller', group: 'day' }))
      .toBe('/app/community?area=mueller&category=yard-cleanup&type=task&time=7d&q=leaf++bags&saved=1&sort=new&view=list&group=day&page=2');
  });
});
