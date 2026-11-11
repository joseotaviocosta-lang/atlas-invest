/**
 * Project Atlas — CVM & Regulatory Official News Provider (APP-16K-R1)
 *
 * Implements deterministic retrieval and normalization of official regulatory events
 * from CVM Dados Abertos (Companhias Abertas IPE) and B3 Fundos.NET (FIIs/Fiagros).
 *
 * Runtime Hardening & Invariants:
 * 1. Zero dependency on scratch/ — CVM annual ZIP dataset is downloaded on-demand to
 *    %LOCALAPPDATA%\Atlas\cache\regulatory\ with conditional headers (ETag/Last-Modified)
 *    and a configurable TTL (12 hours).
 * 2. Pure Node builtin ZIP extraction using PKZIP header parsing + zlib.inflateRawSync.
 * 3. Header-based CSV parsing (case-insensitive column mapping) with Latin1/Windows-1252 decoding.
 * 4. Deterministic raw ID generation: cvm_<protocol> or cvm_<stable_hash(cvmCode+deliveryDate+category+subject)>.
 *    Zero Math.random().
 * 5. Strict date parsing: invalid dates return null and are discarded; future dates (> 24h skew) are ignored.
 * 6. Explicit component and aggregated provider statuses:
 *    - CVM: AVAILABLE, NO_EVENTS, UNAVAILABLE, STALE_CACHE, NOT_APPLICABLE
 *    - FNET: AVAILABLE, NO_EVENTS, UNAVAILABLE, NOT_APPLICABLE
 *    - Overall: OFFICIAL_PROVIDER_AVAILABLE, OFFICIAL_PROVIDER_PARTIAL, OFFICIAL_PROVIDER_UNAVAILABLE,
 *               OFFICIAL_PROVIDER_STALE_CACHE, NO_OFFICIAL_EVENTS, UNRESOLVED_REGULATORY_IDENTITY.
 * 7. Fail-closed: failure of one provider (e.g. CVM) does not invalidate the other (e.g. FNET).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import {
  NewsEventType,
  OfficialComponentStatus,
  OfficialProviderFetchResult,
  OfficialProviderStatus,
  RawNewsInput,
} from './portfolio-news.types';
import { resolveRegulatoryIssuer } from './cvm-registry';

export interface CvmEventRecord {
  cnpj: string;
  companyName: string;
  cvmCode: string;
  category: string;
  type?: string;
  species?: string;
  subject?: string;
  deliveryDate: string; // YYYY-MM-DD
  protocol?: string;
  downloadUrl: string;
}

export interface FnetDocumentRecord {
  id: number;
  categoriaDocumento: string;
  tipoDocumento?: string;
  especieDocumento?: string;
  dataEntrega: string; // DD/MM/YYYY HH:mm
  dataReferencia?: string;
  descricaoFundo?: string;
  nomePregao?: string;
  altaPrioridade?: boolean;
}

/**
 * Normalizes CVM IPE category / subject into canonical NewsEventType.
 */
export function normalizeCvmEventType(category: string, subject: string = '', species: string = ''): NewsEventType {
  const combined = `${category} ${subject} ${species}`.toLowerCase();

  if (/fato\s+relevante/i.test(combined)) {
    return 'FACT_RELEVANT';
  }
  if (/comunicado\s+ao\s+mercado/i.test(combined)) {
    return 'MARKET_NOTICE';
  }
  if (/aviso\s+aos\s+acionistas/i.test(combined) || /aviso\s+aos\s+cotistas/i.test(combined) || /dividendo|juros\s+sobre\s+capital|rendimento/i.test(combined)) {
    return 'DIVIDEND';
  }
  if (/dados\s+econ[oô]mico-financeiros|demonstra[cç][oõ]es|resultado|balan[cç]o|press-release|dre\b/i.test(combined)) {
    return 'EARNINGS';
  }
  if (/recompra|aumento\s+de\s+capital|subscri[cç][aã]o|bonifica[cç][aã]o|desdobramento|grupamento/i.test(combined)) {
    return 'CAPITAL_EVENT';
  }
  if (/assembleia|age\b|ago\b/i.test(combined)) {
    return 'ASSEMBLY';
  }
  if (/relat[oó]rio\s+gerencial|informe\s+mensal/i.test(combined)) {
    return 'MANAGEMENT_REPORT';
  }
  if (/decis[aã]o\s+regulat[oó]ria|processo|sancionador/i.test(combined)) {
    return 'REGULATORY';
  }

  return 'OTHER';
}

/**
 * Parses a CVM delivery date string (YYYY-MM-DD or ISO) into Date.
 * Invariant: Returns null on invalid or future dates beyond 24h skew. Never defaults to new Date().
 */
export function parseCvmDeliveryDate(dateStr: string, referenceDate: Date = new Date()): Date | null {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim().length === 0) return null;
  const trimmed = dateStr.trim();

  let parsed: Date;
  if (trimmed.includes('T')) {
    parsed = new Date(trimmed);
  } else {
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]!, 10);
      const month = parseInt(parts[1]!, 10) - 1;
      const day = parseInt(parts[2]!, 10);
      if (isNaN(year) || isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) {
        return null;
      }
      parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
    } else {
      parsed = new Date(trimmed);
    }
  }

  if (isNaN(parsed.getTime())) return null;

  // Fail-closed against far-future dates (> 24 hours skew)
  const maxFutureMs = 24 * 60 * 60 * 1000;
  if (parsed.getTime() - referenceDate.getTime() > maxFutureMs) {
    return null;
  }

  return parsed;
}

/**
 * Parses B3 FNET delivery date (DD/MM/YYYY HH:mm) into Date.
 * Invariant: Returns null on invalid or future dates beyond 24h skew. Never defaults to new Date().
 */
export function parseFnetDeliveryDate(dateStr: string, referenceDate: Date = new Date()): Date | null {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim().length === 0) return null;
  const trimmed = dateStr.trim();

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return null;

  const day = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1;
  const year = parseInt(match[3]!, 10);
  const hour = match[4] ? parseInt(match[4], 10) : 12;
  const min = match[5] ? parseInt(match[5], 10) : 0;

  if (isNaN(day) || isNaN(month) || isNaN(year) || month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month, day, hour, min, 0));
  if (isNaN(parsed.getTime())) return null;

  const maxFutureMs = 24 * 60 * 60 * 1000;
  if (parsed.getTime() - referenceDate.getTime() > maxFutureMs) {
    return null;
  }

  return parsed;
}

/**
 * Generates a deterministic stable ID for a CVM record.
 * Invariant: Completely deterministic; ZERO Math.random().
 */
export function generateDeterministicCvmId(record: {
  protocol?: string;
  cvmCode: string;
  deliveryDate: string;
  category: string;
  subject?: string;
  downloadUrl?: string;
}): string {
  if (record.protocol && record.protocol.trim().length > 0) {
    return `cvm_${record.protocol.trim()}`;
  }
  const rawKey = `${record.cvmCode}:${record.deliveryDate}:${record.category}:${record.subject || ''}:${record.downloadUrl || ''}`;
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  return `cvm_${hash}`;
}

/**
 * Converts a raw CVM record to RawNewsInput with verified official provenance.
 */
export function cvmRecordToRawNews(record: CvmEventRecord, ticker: string, referenceDate: Date = new Date()): RawNewsInput | null {
  const pubDate = parseCvmDeliveryDate(record.deliveryDate, referenceDate);
  if (!pubDate) return null;

  const headline = record.subject && record.subject.trim().length > 0
    ? `${record.companyName} (${ticker}): ${record.category} — ${record.subject}`
    : `${record.companyName} (${ticker}): ${record.category}`;

  const id = generateDeterministicCvmId(record);

  return {
    id,
    headline,
    summary: `${record.category} entregue à CVM em ${record.deliveryDate}. Espécie: ${record.species || '—'}. Tipo: ${record.type || '—'}.`,
    url: record.downloadUrl || 'https://www.rad.cvm.gov.br/ENET/',
    sourceName: 'CVM',
    publishedAt: pubDate,
    ticker,
    provider: 'CVM',
    sourceType: 'OFFICIAL_REGULATORY',
    official: true,
  };
}

/**
 * Converts a B3 FNET document record to RawNewsInput with verified official provenance.
 */
export function fnetRecordToRawNews(record: FnetDocumentRecord, ticker: string, referenceDate: Date = new Date()): RawNewsInput | null {
  const pubDate = parseFnetDeliveryDate(record.dataEntrega, referenceDate);
  if (!pubDate) return null;

  const subjectPart = record.especieDocumento || record.tipoDocumento || '';
  const headline = subjectPart
    ? `${ticker}: ${record.categoriaDocumento} — ${subjectPart}`
    : `${ticker}: ${record.categoriaDocumento}`;

  const docUrl = `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=${record.id}`;

  return {
    id: `fnet_${record.id}`,
    headline,
    summary: `${record.categoriaDocumento} oficial divulgado no FNET/B3 em ${record.dataEntrega}.`,
    url: docUrl,
    sourceName: 'B3',
    publishedAt: pubDate,
    ticker,
    provider: 'B3',
    sourceType: 'OFFICIAL_REGULATORY',
    official: true,
  };
}

/**
 * Pure Node PKZIP single file extractor.
 * Unzips a standard PKZIP archive in memory without external dependencies.
 */
export function extractFirstZipFile(zipBuffer: Buffer): { fileName: string; data: Buffer } {
  if (zipBuffer.length < 30 || zipBuffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Invalid PKZIP header signature');
  }

  const compressionMethod = zipBuffer.readUInt16LE(8);
  const compressedSize = zipBuffer.readUInt32LE(18);
  const fileNameLength = zipBuffer.readUInt16LE(26);
  const extraFieldLength = zipBuffer.readUInt16LE(28);

  const fileName = zipBuffer.toString('utf8', 30, 30 + fileNameLength);
  const fileDataOffset = 30 + fileNameLength + extraFieldLength;
  const compressedData = zipBuffer.subarray(fileDataOffset, fileDataOffset + compressedSize);

  let uncompressedData: Buffer;
  if (compressionMethod === 0) {
    uncompressedData = compressedData;
  } else if (compressionMethod === 8) {
    uncompressedData = zlib.inflateRawSync(compressedData);
  } else {
    throw new Error(`Unsupported PKZIP compression method: ${compressionMethod}`);
  }

  return { fileName, data: uncompressedData };
}

/**
 * Configuration for CVM Official News Provider.
 */
export interface CvmProviderOptions {
  customCacheDir?: string;
  cacheTtlMs?: number;
  cvmIpeUrl?: string;
  fnetBaseUrl?: string;
  fetchFn?: typeof fetch;
}

export class CvmOfficialNewsProvider {
  public static readonly OFFICIAL_CVM_IPE_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2026.zip';
  public static readonly DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly cvmIpeUrl: string;
  private readonly fetchFn: typeof fetch;

  // In-memory cache for parsed events
  private memoryCache = new Map<string, { articles: RawNewsInput[]; timestamp: number }>();

  constructor(options?: CvmProviderOptions) {
    const baseLocalApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    this.cacheDir = options?.customCacheDir || path.join(baseLocalApp, 'Atlas', 'cache', 'regulatory');
    this.cacheTtlMs = options?.cacheTtlMs || CvmOfficialNewsProvider.DEFAULT_CACHE_TTL_MS;
    this.cvmIpeUrl = options?.cvmIpeUrl || CvmOfficialNewsProvider.OFFICIAL_CVM_IPE_URL;
    this.fetchFn = options?.fetchFn || fetch;
  }

  /**
   * Returns the runtime cache directory path.
   */
  getCacheDirectory(): string {
    return this.cacheDir;
  }

  /**
   * Fetches official regulatory events across tickers with explicit component and aggregated statuses.
   */
  async fetchOfficialEvents(
    tickers: string[],
    referenceDate: Date = new Date(),
  ): Promise<OfficialProviderFetchResult> {
    const uniqueTickers = Array.from(new Set(tickers.map((t) => t.toUpperCase().trim()))).filter(Boolean);
    const stockTickers: string[] = [];
    const fiiTickers: string[] = [];
    let resolvedCount = 0;
    let unresolvedCount = 0;

    const perAssetStatus: Record<
      string,
      'OFFICIAL_SOURCE_OK' | 'NO_OFFICIAL_EVENTS' | 'IDENTITY_NOT_RESOLVED' | 'PROVIDER_UNAVAILABLE'
    > = {};

    for (const t of uniqueTickers) {
      const identity = resolveRegulatoryIssuer(t);
      if (!identity) {
        unresolvedCount++;
        perAssetStatus[t] = 'IDENTITY_NOT_RESOLVED';
      } else {
        resolvedCount++;
        if (identity.assetType === 'STOCK' && identity.cvmCode) {
          stockTickers.push(t);
        } else if (identity.assetType === 'FII' && identity.cnpj) {
          fiiTickers.push(t);
        }
      }
    }

    const allArticles: RawNewsInput[] = [];

    // 1. Fetch CVM Stock Events (Dataset)
    let cvmStatus: OfficialComponentStatus = stockTickers.length > 0 ? 'AVAILABLE' : 'NOT_APPLICABLE';
    let cvmFromCache = false;
    let cvmError: string | undefined = undefined;
    let cvmArticlesCount = 0;

    if (stockTickers.length > 0) {
      const cvmRes = await this.fetchCvmStockEvents(stockTickers, referenceDate);
      cvmStatus = cvmRes.status;
      cvmFromCache = cvmRes.fromCache;
      cvmError = cvmRes.error;
      cvmArticlesCount = cvmRes.articles.length;
      allArticles.push(...cvmRes.articles);

      for (const t of stockTickers) {
        if (cvmStatus === 'UNAVAILABLE') {
          perAssetStatus[t] = 'PROVIDER_UNAVAILABLE';
        } else {
          const hasArticles = cvmRes.articles.some((a) => a.ticker === t);
          perAssetStatus[t] = hasArticles ? 'OFFICIAL_SOURCE_OK' : 'NO_OFFICIAL_EVENTS';
        }
      }
    }

    // 2. Fetch B3 FNET FII Events
    let fnetStatus: OfficialComponentStatus = fiiTickers.length > 0 ? 'AVAILABLE' : 'NOT_APPLICABLE';
    let fnetError: string | undefined = undefined;
    let fnetArticlesCount = 0;

    if (fiiTickers.length > 0) {
      const fnetRes = await this.fetchFnetFiiEvents(fiiTickers, referenceDate);
      fnetStatus = fnetRes.status;
      fnetError = fnetRes.error;
      fnetArticlesCount = fnetRes.articles.length;
      allArticles.push(...fnetRes.articles);

      for (const t of fiiTickers) {
        if (fnetStatus === 'UNAVAILABLE') {
          perAssetStatus[t] = 'PROVIDER_UNAVAILABLE';
        } else {
          const hasArticles = fnetRes.articles.some((a) => a.ticker === t);
          perAssetStatus[t] = hasArticles ? 'OFFICIAL_SOURCE_OK' : 'NO_OFFICIAL_EVENTS';
        }
      }
    }

    // 3. Derive Aggregated Overall Status
    let overallStatus: OfficialProviderStatus;
    if (resolvedCount === 0) {
      overallStatus = 'UNRESOLVED_REGULATORY_IDENTITY';
    } else {
      const isCvmActive = stockTickers.length > 0;
      const isFnetActive = fiiTickers.length > 0;

      const isCvmStale = isCvmActive && cvmStatus === 'STALE_CACHE';
      const isCvmDown = isCvmActive && cvmStatus === 'UNAVAILABLE';

      const isFnetDown = isFnetActive && fnetStatus === 'UNAVAILABLE';

      if (isCvmActive && isFnetActive) {
        if (isCvmDown && isFnetDown) {
          overallStatus = 'OFFICIAL_PROVIDER_UNAVAILABLE';
        } else if (isCvmDown || isFnetDown) {
          overallStatus = 'OFFICIAL_PROVIDER_PARTIAL';
        } else if (isCvmStale) {
          overallStatus = 'OFFICIAL_PROVIDER_STALE_CACHE';
        } else if (allArticles.length === 0) {
          overallStatus = 'NO_OFFICIAL_EVENTS';
        } else {
          overallStatus = 'OFFICIAL_PROVIDER_AVAILABLE';
        }
      } else if (isCvmActive) {
        if (isCvmDown) {
          overallStatus = 'OFFICIAL_PROVIDER_UNAVAILABLE';
        } else if (isCvmStale) {
          overallStatus = 'OFFICIAL_PROVIDER_STALE_CACHE';
        } else if (allArticles.length === 0) {
          overallStatus = 'NO_OFFICIAL_EVENTS';
        } else {
          overallStatus = 'OFFICIAL_PROVIDER_AVAILABLE';
        }
      } else if (isFnetActive) {
        if (isFnetDown) {
          overallStatus = 'OFFICIAL_PROVIDER_UNAVAILABLE';
        } else if (allArticles.length === 0) {
          overallStatus = 'NO_OFFICIAL_EVENTS';
        } else {
          overallStatus = 'OFFICIAL_PROVIDER_AVAILABLE';
        }
      } else {
        overallStatus = 'NO_OFFICIAL_EVENTS';
      }
    }

    return {
      articles: allArticles,
      resolvedCount,
      unresolvedCount,
      overallStatus,
      cvm: {
        status: cvmStatus,
        fetched: cvmArticlesCount,
        fromCache: cvmFromCache,
        error: cvmError,
      },
      fnet: {
        status: fnetStatus,
        fetched: fnetArticlesCount,
        error: fnetError,
      },
      perAssetStatus,
    };
  }

  /**
   * Fetches official CVM stock events using the managed local cache or on-demand HTTP download.
   */
  private async fetchCvmStockEvents(
    tickers: string[],
    referenceDate: Date,
  ): Promise<{
    articles: RawNewsInput[];
    status: OfficialComponentStatus;
    fromCache: boolean;
    error?: string;
  }> {
    const csvPath = path.join(this.cacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(this.cacheDir, 'cvm_ipe_meta.json');

    let usedStaleCache = false;
    let resFreshlyDownloaded = false;

    // Ensure cache directory exists
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch {
      // Ignore mkdir failure
    }

    // Check if valid cache exists
    let cacheValid = false;
    let savedEtag: string | undefined;
    let savedLastModified: string | undefined;

    if (fs.existsSync(metaPath) && fs.existsSync(csvPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
          timestamp: number;
          etag?: string;
          lastModified?: string;
        };
        savedEtag = meta.etag;
        savedLastModified = meta.lastModified;
        if (Date.now() - meta.timestamp < this.cacheTtlMs) {
          cacheValid = true;
        }
      } catch {
        cacheValid = false;
      }
    }

    // If cache is expired or missing, attempt conditional / direct download
    if (!cacheValid) {
      try {
        const headers: Record<string, string> = {
          'User-Agent': 'Atlas-Invest/0.1.0',
          Accept: 'application/zip, application/octet-stream',
        };
        if (savedEtag) headers['If-None-Match'] = savedEtag;
        if (savedLastModified) headers['If-Modified-Since'] = savedLastModified;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const res = await this.fetchFn(this.cvmIpeUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 304 && fs.existsSync(csvPath)) {
          // 304 Not Modified: Touch cache timestamp
          fs.writeFileSync(
            metaPath,
            JSON.stringify({ timestamp: Date.now(), etag: savedEtag, lastModified: savedLastModified }),
            'utf8',
          );
        } else if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const zipBuffer = Buffer.from(arrayBuf);
          const extracted = extractFirstZipFile(zipBuffer);

          fs.writeFileSync(csvPath, extracted.data);
          const etag = res.headers.get('etag') || undefined;
          const lastModified = res.headers.get('last-modified') || undefined;
          fs.writeFileSync(
            metaPath,
            JSON.stringify({ timestamp: Date.now(), etag, lastModified }),
            'utf8',
          );
          cacheValid = true; // freshly downloaded and written
          resFreshlyDownloaded = true;
        } else if (fs.existsSync(csvPath)) {
          // HTTP error but stale cache exists
          usedStaleCache = true;
        } else {
          return {
            articles: [],
            status: 'UNAVAILABLE',
            fromCache: false,
            error: `CVM HTTP ${res.status}`,
          };
        }
      } catch (err) {
        if (fs.existsSync(csvPath)) {
          usedStaleCache = true;
        } else {
          return {
            articles: [],
            status: 'UNAVAILABLE',
            fromCache: false,
            error: String(err),
          };
        }
      }
    }

    // Parse CSV from managed cache file
    if (!fs.existsSync(csvPath)) {
      return {
        articles: [],
        status: 'UNAVAILABLE',
        fromCache: false,
        error: 'CVM dataset cache not found',
      };
    }

    try {
      const csvBuffer = fs.readFileSync(csvPath);
      // CVM Dados Abertos CSV uses Latin1 / Windows-1252 encoding
      const csvContent = csvBuffer.toString('latin1');
      const lines = csvContent.split(/\r?\n/);

      if (lines.length < 2) {
        return {
          articles: [],
          status: 'UNAVAILABLE',
          fromCache: !cacheValid,
          error: 'Empty or invalid CVM CSV content',
        };
      }

      // Map headers dynamically (case-insensitive)
      const headerLine = lines[0]!;
      const headers = headerLine.split(';').map((h) => h.trim().toUpperCase());

      const colCvm = headers.indexOf('CODIGO_CVM');
      const colCategory = headers.indexOf('CATEGORIA');
      const colDeliveryDate = headers.indexOf('DATA_ENTREGA');
      const colRefDate = headers.indexOf('DATA_REFERENCIA');
      const colCnpj = headers.indexOf('CNPJ_COMPANHIA');
      const colName = headers.indexOf('NOME_COMPANHIA');
      const colSubject = headers.indexOf('ASSUNTO');
      const colSpecies = headers.indexOf('ESPECIE');
      const colType = headers.indexOf('TIPO');
      const colProtocol = headers.indexOf('PROTOCOLO_ENTREGA');
      const colUrl = headers.indexOf('LINK_DOWNLOAD');

      if (colCvm === -1 || colCategory === -1 || (colDeliveryDate === -1 && colRefDate === -1)) {
        return {
          articles: [],
          status: 'UNAVAILABLE',
          fromCache: !cacheValid,
          error: 'Required CVM columns missing from header',
        };
      }

      // Build target CVM codes set
      const cvmCodeToTicker = new Map<string, string>();
      for (const t of tickers) {
        const id = resolveRegulatoryIssuer(t);
        if (id && id.cvmCode) {
          cvmCodeToTicker.set(id.cvmCode.trim(), t);
        }
      }

      const results: RawNewsInput[] = [];
      const maxAgeMs = 90 * 24 * 60 * 60 * 1000;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim().length === 0) continue;
        const parts = line.split(';');

        const cvmCode = parts[colCvm]?.trim();
        if (!cvmCode || !cvmCodeToTicker.has(cvmCode)) continue;

        const ticker = cvmCodeToTicker.get(cvmCode)!;
        const deliveryDateStr = (colDeliveryDate !== -1 ? parts[colDeliveryDate] : '') || parts[colRefDate] || '';

        const pubDate = parseCvmDeliveryDate(deliveryDateStr, referenceDate);
        if (!pubDate) continue; // Discard invalid or future dates

        const ageMs = referenceDate.getTime() - pubDate.getTime();
        if (ageMs > maxAgeMs) continue; // Discard > 90d

        const rec: CvmEventRecord = {
          cnpj: (colCnpj !== -1 ? parts[colCnpj] : '') || '',
          companyName: (colName !== -1 ? parts[colName] : '') || ticker,
          cvmCode,
          category: (colCategory !== -1 ? parts[colCategory] : '') || 'Outros',
          type: colType !== -1 ? parts[colType] : '',
          species: colSpecies !== -1 ? parts[colSpecies] : '',
          subject: colSubject !== -1 ? parts[colSubject] : '',
          deliveryDate: deliveryDateStr,
          protocol: colProtocol !== -1 ? parts[colProtocol] : '',
          downloadUrl: (colUrl !== -1 ? parts[colUrl] : '') || 'https://www.rad.cvm.gov.br/ENET/',
        };

        const raw = cvmRecordToRawNews(rec, ticker, referenceDate);
        if (raw) results.push(raw);
      }

      const status: OfficialComponentStatus = usedStaleCache
        ? 'STALE_CACHE'
        : results.length === 0
        ? 'NO_EVENTS'
        : 'AVAILABLE';

      return {
        articles: results,
        status,
        fromCache: Boolean(!resFreshlyDownloaded && (cacheValid || usedStaleCache)),
      };
    } catch (err) {
      return {
        articles: [],
        status: 'UNAVAILABLE',
        fromCache: true,
        error: String(err),
      };
    }
  }

  /**
   * Fetches B3 FNET official disclosures for FIIs/Fiagros by CNPJ.
   */
  private async fetchFnetFiiEvents(
    tickers: string[],
    referenceDate: Date,
  ): Promise<{
    articles: RawNewsInput[];
    status: OfficialComponentStatus;
    error?: string;
  }> {
    const results: RawNewsInput[] = [];
    let anyOk = false;
    let anyFail = false;

    for (const t of tickers) {
      const id = resolveRegulatoryIssuer(t);
      if (!id || !id.cnpj) continue;
      const cleanCnpj = id.cnpj.replace(/\D/g, '');
      if (!cleanCnpj) continue;

      const url = `https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados?d=0&s=0&l=15&cnpjFundo=${cleanCnpj}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);

        const res = await this.fetchFn(url, {
          headers: {
            'User-Agent': 'Atlas-Invest/0.1.0',
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          anyOk = true;
          const json = (await res.json().catch(() => null)) as { data?: FnetDocumentRecord[] };
          const records = json?.data || [];
          const maxAgeMs = 90 * 24 * 60 * 60 * 1000;

          for (const r of records) {
            if (!r.id || !r.categoriaDocumento) continue;
            const pubDate = parseFnetDeliveryDate(r.dataEntrega, referenceDate);
            if (!pubDate) continue;

            const ageMs = referenceDate.getTime() - pubDate.getTime();
            if (ageMs > maxAgeMs) continue;

            const raw = fnetRecordToRawNews(r, t, referenceDate);
            if (raw) results.push(raw);
          }
        } else {
          anyFail = true;
        }
      } catch {
        anyFail = true;
      }
    }

    if (!anyOk && anyFail) {
      return {
        articles: [],
        status: 'UNAVAILABLE',
        error: 'FNET request failed for all FIIs',
      };
    }

    return {
      articles: results,
      status: results.length === 0 ? 'NO_EVENTS' : 'AVAILABLE',
    };
  }

  /**
   * Clears internal memory cache.
   */
  clearCache(): void {
    this.memoryCache.clear();
  }
}
