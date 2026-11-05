import { apiClient } from '../../lib/api';
import type { MacroContextResponse } from './types';

export const marketApi = {
  async getMacroContext(): Promise<MacroContextResponse> {
    return apiClient.get<MacroContextResponse>('/api/v1/macro/context');
  },
};
