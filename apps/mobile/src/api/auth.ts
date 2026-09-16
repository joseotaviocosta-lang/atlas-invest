import { apiClient } from './client';
import { AuthUser, LoginResponse, RefreshResponse } from './types';
import {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@atlas/validation';

export const authApi = {
  async register(data: RegisterInput): Promise<{ data: AuthUser }> {
    return apiClient.post<{ data: AuthUser }>('/api/v1/auth/register', data, { skipAuth: true });
  },

  async login(data: LoginInput): Promise<{ data: LoginResponse }> {
    return apiClient.post<{ data: LoginResponse }>('/api/v1/auth/login', data, { skipAuth: true });
  },

  async refresh(refreshToken: string): Promise<{ data: RefreshResponse }> {
    return apiClient.post<{ data: RefreshResponse }>(
      '/api/v1/auth/refresh',
      { refreshToken },
      { skipAuth: true },
    );
  },

  async logout(): Promise<{ data: { success: boolean } }> {
    return apiClient.post<{ data: { success: boolean } }>('/api/v1/auth/logout');
  },

  async getMe(): Promise<{ data: AuthUser }> {
    return apiClient.get<{ data: AuthUser }>('/api/v1/auth/me');
  },

  async forgotPassword(data: ForgotPasswordInput): Promise<{ data: { message: string } }> {
    return apiClient.post<{ data: { message: string } }>('/api/v1/auth/forgot-password', data, {
      skipAuth: true,
    });
  },

  async resetPassword(data: ResetPasswordInput): Promise<{ data: { success: boolean } }> {
    return apiClient.post<{ data: { success: boolean } }>('/api/v1/auth/reset-password', data, {
      skipAuth: true,
    });
  },
};
