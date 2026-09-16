/**
 * Environment configuration for Project Atlas Web App
 */

export const API_BASE_URL =
  process.env.ATLAS_API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
