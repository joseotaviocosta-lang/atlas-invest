import { z } from 'zod';
import {
  SUPPORTED_CURRENCIES,
  ASSET_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
  PORTFOLIO_TYPES,
  INSTITUTION_TYPES,
  ACCOUNT_STATUSES,
  PORTFOLIO_STATUSES,
  ASSET_STATUSES,
  LocalDate,
} from '@atlas/domain';

export const VALIDATION_VERSION = '0.1.0';

export const UUIDSchema = z.string().uuid({ message: 'Must be a valid UUID' });

export const CurrencySchema = z.enum(SUPPORTED_CURRENCIES, {
  errorMap: () => ({ message: `Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}` }),
});

export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Must be a valid ISO date string in YYYY-MM-DD format',
  })
  .refine(
    (val) => {
      try {
        LocalDate.from(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid calendar date' },
  );

export const DecimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, { message: 'Must be a valid decimal string' });

export const PositiveDecimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, { message: 'Must be a non-negative decimal string' });

export const MoneySchema = z.object({
  amount: DecimalStringSchema,
  currency: CurrencySchema,
});

export const QuantitySchema = DecimalStringSchema;

export const AssetTypeSchema = z.enum(ASSET_TYPES);
export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const TransactionSourceSchema = z.enum(TRANSACTION_SOURCES);
export const PortfolioTypeSchema = z.enum(PORTFOLIO_TYPES);
export const InstitutionTypeSchema = z.enum(INSTITUTION_TYPES);
export const AccountStatusSchema = z.enum(ACCOUNT_STATUSES);
export const PortfolioStatusSchema = z.enum(PORTFOLIO_STATUSES);
export const AssetStatusSchema = z.enum(ASSET_STATUSES);

export const AssetInputSchema = z.object({
  id: UUIDSchema.optional(),
  ticker: z.string().min(1, 'Ticker cannot be empty'),
  name: z.string().min(1, 'Name cannot be empty'),
  type: AssetTypeSchema,
  currency: CurrencySchema,
  exchange: z.string().min(1, 'Exchange cannot be empty'),
  isin: z.string().optional(),
  cnpj: z.string().optional(),
  status: AssetStatusSchema.optional(),
});
export type AssetInput = z.infer<typeof AssetInputSchema>;

export const InstitutionInputSchema = z.object({
  id: UUIDSchema.optional(),
  name: z.string().min(1, 'Name cannot be empty'),
  type: InstitutionTypeSchema,
  country: z.string().min(2, 'Country code must be at least 2 characters'),
});
export type InstitutionInput = z.infer<typeof InstitutionInputSchema>;

export const AccountInputSchema = z.object({
  id: UUIDSchema.optional(),
  portfolioId: UUIDSchema,
  institutionId: UUIDSchema,
  name: z.string().min(1, 'Name cannot be empty'),
  currency: CurrencySchema,
  status: AccountStatusSchema.optional(),
});
export type AccountInput = z.infer<typeof AccountInputSchema>;

export const EmailSchema = z
  .string()
  .transform((val) => val.trim().toLowerCase())
  .pipe(z.string().email({ message: 'Invalid email format' }));

export const PasswordSchema = z
  .string()
  .min(10, { message: 'Password must be at least 10 characters long' });

export const RegisterInputSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().min(1, 'Name cannot be empty'),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password cannot be empty'),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token cannot be empty'),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>;

export const ForgotPasswordInputSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1, 'Reset token cannot be empty'),
  newPassword: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

export const CreatePortfolioInputSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty'),
    baseCurrency: CurrencySchema,
    type: PortfolioTypeSchema.optional(),
  })
  .strict();
export type CreatePortfolioInput = z.infer<typeof CreatePortfolioInputSchema>;

export const PortfolioInputSchema = z.object({
  id: UUIDSchema.optional(),
  userId: UUIDSchema.optional(),
  name: z.string().min(1, 'Name cannot be empty'),
  baseCurrency: CurrencySchema,
  type: PortfolioTypeSchema.optional(),
  status: PortfolioStatusSchema.optional(),
});
export type PortfolioInput = z.infer<typeof PortfolioInputSchema>;

export const TransactionInputSchema = z.object({
  id: UUIDSchema.optional(),
  portfolioId: UUIDSchema,
  accountId: UUIDSchema,
  type: TransactionTypeSchema,
  currency: CurrencySchema,
  tradeDate: LocalDateSchema,
  settlementDate: LocalDateSchema.optional(),
  source: TransactionSourceSchema.optional(),
  provider: z.string().optional(),
  externalId: z.string().optional(),
  notes: z.string().optional(),
  assetId: UUIDSchema.optional(),
  targetAssetId: UUIDSchema.optional(),
  quantity: DecimalStringSchema.optional(),
  targetQuantity: DecimalStringSchema.optional(),
  conversionRatio: DecimalStringSchema.optional(),
  conversionType: z.string().optional(),
  unitPrice: DecimalStringSchema.optional(),
  fees: DecimalStringSchema.optional(),
  taxes: DecimalStringSchema.optional(),
  amount: DecimalStringSchema.optional(),
  factor: DecimalStringSchema.optional(),
});
export type TransactionInput = z.infer<typeof TransactionInputSchema>;
