import { describe, it, expect } from 'vitest';
import { CANONICAL_NAV_ITEMS, PROFILE_NAV_ITEM } from '@atlas/ui';

describe('Mobile Shell: Canonical Navigation Alignment', () => {
  it('should define all 5 core mobile tab screens in matching canonical order', () => {
    const expectedTabs = ['today', 'portfolio', 'market', 'tax', 'ai'];
    const actualTabIds = CANONICAL_NAV_ITEMS.map((item) => item.id);
    expect(actualTabIds).toEqual(expectedTabs);

    const labels = CANONICAL_NAV_ITEMS.map((item) => item.label);
    expect(labels).toEqual(['Hoje', 'Carteira', 'Mercado', 'Fiscal', 'IA']);
  });

  it('should isolate profile screen outside the bottom tabs navigation', () => {
    expect(PROFILE_NAV_ITEM.id).toBe('profile');
    expect(PROFILE_NAV_ITEM.path).toBe('/profile');
    expect(CANONICAL_NAV_ITEMS.find((item) => item.id === 'profile')).toBeUndefined();
  });
});
