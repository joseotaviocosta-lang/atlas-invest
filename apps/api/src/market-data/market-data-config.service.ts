import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  BrapiProviderAdapter,
  BrapiHistoricalMarketDataProvider,
  MarketDataProvider,
  HistoricalMarketDataProvider,
} from '@atlas/market-data';
import { Logger } from '@atlas/logger';
import {
  MARKET_DATA_PROVIDER,
  HISTORICAL_MARKET_DATA_PROVIDER,
  HISTORICAL_MARKET_DATA_INGESTION_PROVIDER,
} from './tokens';

export interface MarketDataProviderStatus {
  provider: string;
  authenticated: boolean;
  source: 'ENVIRONMENT' | 'LOCAL_SECRET_STORE' | 'NONE';
  status: 'CONFIGURED' | 'NOT_CONFIGURED';
  message: string;
}

@Injectable()
export class MarketDataConfigService {
  private readonly logger = new Logger({ service: 'market-data-config' });

  constructor(
    @Inject(MARKET_DATA_PROVIDER)
    private readonly marketDataProvider: MarketDataProvider,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
    @Inject(HISTORICAL_MARKET_DATA_INGESTION_PROVIDER)
    private readonly historicalIngestionProvider: HistoricalMarketDataProvider,
  ) {}

  private getSecretsFilePath(): string {
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
    return path.join(localAppData, 'Atlas', 'secrets.json');
  }

  getStatus(): MarketDataProviderStatus {
    const envToken = process.env.BRAPI_API_KEY || process.env.MARKET_DATA_API_TOKEN;
    let source: 'ENVIRONMENT' | 'LOCAL_SECRET_STORE' | 'NONE' = 'NONE';
    let hasToken = false;

    if (envToken && envToken.trim().length > 0) {
      source = 'ENVIRONMENT';
      hasToken = true;
    } else {
      const secretsFile = this.getSecretsFilePath();
      try {
        if (fs.existsSync(secretsFile)) {
          const raw = fs.readFileSync(secretsFile, 'utf8');
          const data = JSON.parse(raw);
          if (data && typeof data.BRAPI_API_KEY === 'string' && data.BRAPI_API_KEY.trim().length > 0) {
            source = 'LOCAL_SECRET_STORE';
            hasToken = true;
          }
        }
      } catch {
        // Fallback to NONE
      }
    }

    if (!hasToken) {
      // Check if adapter itself has an active token in memory
      if (this.marketDataProvider instanceof BrapiProviderAdapter && this.marketDataProvider.hasToken()) {
        hasToken = true;
      }
    }

    return {
      provider: 'BRAPI',
      authenticated: hasToken,
      source,
      status: hasToken ? 'CONFIGURED' : 'NOT_CONFIGURED',
      message: hasToken
        ? 'Provedor autenticado com chave configurada'
        : 'Autenticação não configurada (modo público limitado: apenas PETR4)',
    };
  }

  configureToken(token: string): MarketDataProviderStatus {
    if (!token || typeof token !== 'string' || token.trim().length < 5) {
      throw new BadRequestException({
        message: 'A chave da API fornecida é inválida ou muito curta.',
        code: 'VALIDATION.INVALID_MARKET_DATA_TOKEN',
      });
    }

    const cleanToken = token.trim();
    const secretsFile = this.getSecretsFilePath();

    try {
      const dir = path.dirname(secretsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let currentData: Record<string, unknown> = {};
      if (fs.existsSync(secretsFile)) {
        try {
          currentData = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
        } catch {
          currentData = {};
        }
      }

      currentData.BRAPI_API_KEY = cleanToken;
      fs.writeFileSync(secretsFile, JSON.stringify(currentData, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch (err) {
      this.logger.error('Failed to write local secret store', { error: String(err) });
    }

    // Update process.env and memory instances
    process.env.BRAPI_API_KEY = cleanToken;

    if (this.marketDataProvider instanceof BrapiProviderAdapter) {
      this.marketDataProvider.setToken(cleanToken);
    }
    if (this.historicalProvider instanceof BrapiHistoricalMarketDataProvider) {
      this.historicalProvider.setToken(cleanToken);
    }
    if (this.historicalIngestionProvider instanceof BrapiHistoricalMarketDataProvider) {
      this.historicalIngestionProvider.setToken(cleanToken);
    }

    this.logger.info('Market data provider token configured successfully', {
      provider: 'BRAPI',
      authenticated: true,
    });

    return this.getStatus();
  }

  clearToken(): MarketDataProviderStatus {
    const secretsFile = this.getSecretsFilePath();
    try {
      if (fs.existsSync(secretsFile)) {
        const raw = fs.readFileSync(secretsFile, 'utf8');
        const currentData = JSON.parse(raw);
        delete currentData.BRAPI_API_KEY;
        fs.writeFileSync(secretsFile, JSON.stringify(currentData, null, 2), {
          encoding: 'utf8',
          mode: 0o600,
        });
      }
    } catch (err) {
      this.logger.error('Failed to clear key from local secret store', { error: String(err) });
    }

    delete process.env.BRAPI_API_KEY;

    if (this.marketDataProvider instanceof BrapiProviderAdapter) {
      this.marketDataProvider.setToken(undefined);
    }
    if (this.historicalProvider instanceof BrapiHistoricalMarketDataProvider) {
      this.historicalProvider.setToken(undefined);
    }
    if (this.historicalIngestionProvider instanceof BrapiHistoricalMarketDataProvider) {
      this.historicalIngestionProvider.setToken(undefined);
    }

    this.logger.info('Market data provider token cleared', {
      provider: 'BRAPI',
      authenticated: false,
    });

    return this.getStatus();
  }
}
