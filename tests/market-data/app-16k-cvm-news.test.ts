import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import {
  PORTFOLIO_REGULATORY_REGISTRY,
  resolveRegulatoryIssuer,
  normalizeCvmEventType,
  parseCvmDeliveryDate,
  parseFnetDeliveryDate,
  cvmRecordToRawNews,
  fnetRecordToRawNews,
  generateDeterministicCvmId,
  extractFirstZipFile,
  CvmOfficialNewsProvider,
  canonicalizeNewsEvents,
  calculateNewsScoreV2,
  RawNewsInput,
  classifySourceTrust,
  isTrustedOfficialSource,
} from '../../packages/market-data/src/opportunity-radar';

describe('PROJECT ATLAS — APP-16K-R1: CVM Runtime & Provider Status Integrity', () => {
  const refDate = new Date('2026-11-10T12:00:00.000Z');
  let testCacheDir: string;

  beforeEach(() => {
    testCacheDir = path.join(os.tmpdir(), `atlas_cvm_test_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testCacheDir)) {
        fs.rmSync(testCacheDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
    vi.restoreAllMocks();
  });

  /**
   * Helper to build a valid PKZIP buffer containing a CSV string in memory.
   */
  function createMockZipBuffer(fileName: string, csvContent: string): Buffer {
    const fileData = Buffer.from(csvContent, 'latin1');
    const compressedData = zlib.deflateRawSync(fileData);

    const fileNameBuffer = Buffer.from(fileName, 'utf8');
    const header = Buffer.alloc(30);

    header.writeUInt32LE(0x04034b50, 0); // PKZIP local header signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // general flags
    header.writeUInt16LE(8, 8); // compression method (8 = deflate)
    header.writeUInt16LE(0, 10); // file time
    header.writeUInt16LE(0, 12); // file date
    header.writeUInt32LE(0, 14); // crc32
    header.writeUInt32LE(compressedData.length, 18); // compressed size
    header.writeUInt32LE(fileData.length, 22); // uncompressed size
    header.writeUInt16LE(fileNameBuffer.length, 26); // file name length
    header.writeUInt16LE(0, 28); // extra field length

    return Buffer.concat([header, fileNameBuffer, compressedData]);
  }

  // 1 & 17. 36/36 Registry Integrity
  it('1 & 17. registry resolves all 36 assets with deterministic verified identity', () => {
    const portfolio36 = [
      'B3SA3', 'BBAS3', 'BRAP4', 'BRCR11', 'COGN3', 'EGIE3', 'EZTC3', 'FESA4',
      'FLRY3', 'HGLG11', 'HYPE3', 'IRBR3', 'IRIM11', 'ITSA4', 'JHSF3', 'KCRE11',
      'KNRI11', 'MALL11', 'MCCI11', 'MRFG3', 'MXRF11', 'PETR4', 'PRIO3', 'RBRP11',
      'ROXO34', 'SAPR4', 'SNAG11', 'SNCI11', 'SNEL11', 'SNFF11', 'SNFZ11', 'SNID11',
      'SOJA3', 'TAEE11', 'VGIP11', 'WIZC3',
    ];

    expect(portfolio36).toHaveLength(36);
    for (const t of portfolio36) {
      const id = resolveRegulatoryIssuer(t);
      expect(id).not.toBeNull();
      expect(id?.ticker).toBe(t);
      expect(id?.cnpj).toBeDefined();
    }
  });

  // 2. CVM Download & Cache Miss
  it('2. cache miss: downloads official CVM zip and extracts CSV into managed cache without scratch dependency', async () => {
    const sampleCsv =
      'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n' +
      '10.807.374/0001-77;BOA SAFRA SEMENTES S.A;25704;2026-10-27;Fato Relevante;;;Quinto Plano de Recompra;2026-10-27;AP;1580679;1;https://www.rad.cvm.gov.br/doc1580679\n';

    const mockZipBuf = createMockZipBuffer('ipe_cia_aberta_2026.csv', sampleCsv);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        etag: '"test-etag-1"',
        'last-modified': 'Sun, 08 Nov 2026 10:00:00 GMT',
      }),
      arrayBuffer: async () => mockZipBuf.buffer.slice(mockZipBuf.byteOffset, mockZipBuf.byteOffset + mockZipBuf.byteLength),
    });

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.cvm.status).toBe('AVAILABLE');
    expect(res.cvm.fromCache).toBe(false);
    expect(res.articles).toHaveLength(1);
    expect(res.articles[0]?.ticker).toBe('SOJA3');
    expect(res.articles[0]?.official).toBe(true);
    expect(res.articles[0]?.url).toBe('https://www.rad.cvm.gov.br/doc1580679');

    // Confirm file exists in managed cache
    const cachedCsv = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    expect(fs.existsSync(cachedCsv)).toBe(true);
  });

  // 3. Cache Hit (No Network Call within TTL)
  it('3. cache hit: reuses valid local cache without triggering network download', async () => {
    const csvPath = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(testCacheDir, 'cvm_ipe_meta.json');

    const sampleCsv =
      'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n' +
      '02.932.074/0001-91;HYPERA S/A;21431;2026-10-27;Fato Relevante;;;Novo Programa de Recompra;2026-10-27;AP;1580871;1;https://www.rad.cvm.gov.br/doc1580871\n';

    fs.writeFileSync(csvPath, sampleCsv, 'latin1');
    fs.writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now(), etag: '"etag-hit"' }), 'utf8');

    const mockFetch = vi.fn();
    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['HYPE3'], refDate);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.cvm.status).toBe('AVAILABLE');
    expect(res.cvm.fromCache).toBe(true);
    expect(res.articles).toHaveLength(1);
    expect(res.articles[0]?.ticker).toBe('HYPE3');
  });

  // 4. Stale Cache Fallback on Network Error
  it('4. stale cache: uses existing local dataset with status STALE_CACHE when upstream network fails', async () => {
    const csvPath = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(testCacheDir, 'cvm_ipe_meta.json');

    const sampleCsv =
      'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n' +
      '10.807.374/0001-77;BOA SAFRA SEMENTES S.A;25704;2026-10-27;Fato Relevante;;;Quinto Plano de Recompra;2026-10-27;AP;1580679;1;https://www.rad.cvm.gov.br/doc1580679\n';

    fs.writeFileSync(csvPath, sampleCsv, 'latin1');
    // Expired timestamp (> 12h ago)
    fs.writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now() - 24 * 60 * 60 * 1000 }), 'utf8');

    // Simulate network error (e.g. timeout / offline)
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(res.cvm.status).toBe('STALE_CACHE');
    expect(res.overallStatus).toBe('OFFICIAL_PROVIDER_STALE_CACHE');
    expect(res.cvm.fromCache).toBe(true);
    expect(res.articles).toHaveLength(1);
  });

  // 5. 304 Not Modified Conditional Request
  it('5. conditional request: sends ETag and handles 304 Not Modified without re-downloading', async () => {
    const csvPath = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(testCacheDir, 'cvm_ipe_meta.json');

    const sampleCsv =
      'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n' +
      '10.807.374/0001-77;BOA SAFRA SEMENTES S.A;25704;2026-10-27;Fato Relevante;;;Quinto Plano de Recompra;2026-10-27;AP;1580679;1;https://www.rad.cvm.gov.br/doc1580679\n';

    fs.writeFileSync(csvPath, sampleCsv, 'latin1');
    fs.writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now() - 15 * 60 * 60 * 1000, etag: '"etag-304"' }), 'utf8');

    const mockFetch = vi.fn().mockResolvedValue({
      status: 304,
      ok: false,
    });

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"etag-304"' }),
      }),
    );
    expect(res.cvm.status).toBe('AVAILABLE');
    expect(res.articles).toHaveLength(1);
  });

  // 6. Network Unavailable with No Cache -> OFFICIAL_PROVIDER_UNAVAILABLE (Never NO_OFFICIAL_EVENTS!)
  it('6. network unavailable: returns OFFICIAL_PROVIDER_UNAVAILABLE when download fails and no cache exists', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(res.cvm.status).toBe('UNAVAILABLE');
    expect(res.overallStatus).toBe('OFFICIAL_PROVIDER_UNAVAILABLE');
    expect(res.overallStatus).not.toBe('NO_OFFICIAL_EVENTS');
    expect(res.articles).toHaveLength(0);
    expect(res.perAssetStatus?.['SOJA3']).toBe('PROVIDER_UNAVAILABLE');
  });

  // 7. Invalid CSV Content -> UNAVAILABLE
  it('7. invalid csv: malformed or empty dataset returns UNAVAILABLE without false NO_OFFICIAL_EVENTS', async () => {
    const csvPath = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(testCacheDir, 'cvm_ipe_meta.json');

    fs.writeFileSync(csvPath, 'MALFORMED;HEADER\n', 'latin1');
    fs.writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now() }), 'utf8');

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: vi.fn() as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(res.cvm.status).toBe('UNAVAILABLE');
    expect(res.cvm.error).toContain('missing from header');
    expect(res.overallStatus).not.toBe('NO_OFFICIAL_EVENTS');
  });

  // 8. Valid CSV with Zero Matches -> NO_OFFICIAL_EVENTS
  it('8. valid csv zero match: correctly returns NO_OFFICIAL_EVENTS when dataset is healthy but asset has no recent events', async () => {
    const csvPath = path.join(testCacheDir, 'ipe_cia_aberta_2026.csv');
    const metaPath = path.join(testCacheDir, 'cvm_ipe_meta.json');

    // Dataset has events for other companies, but none for SOJA3 (25704)
    const sampleCsv =
      'CNPJ_Companhia;Nome_Companhia;Codigo_CVM;Data_Referencia;Categoria;Tipo;Especie;Assunto;Data_Entrega;Tipo_Apresentacao;Protocolo_Entrega;Versao;Link_Download\n' +
      '33.000.167/0001-01;PETROBRAS;9512;2026-10-27;Comunicado ao Mercado;;;Producao;2026-10-27;AP;1580999;1;https://www.rad.cvm.gov.br/doc1580999\n';

    fs.writeFileSync(csvPath, sampleCsv, 'latin1');
    fs.writeFileSync(metaPath, JSON.stringify({ timestamp: Date.now() }), 'utf8');

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: vi.fn() as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3'], refDate);

    expect(res.cvm.status).toBe('NO_EVENTS');
    expect(res.overallStatus).toBe('NO_OFFICIAL_EVENTS');
    expect(res.articles).toHaveLength(0);
    expect(res.perAssetStatus?.['SOJA3']).toBe('NO_OFFICIAL_EVENTS');
  });

  // 10 & 14. Invalid Date Handling (Never defaults to new Date())
  it('10 & 14. invalid date: returns null and is strictly discarded without turning into fresh breaking news', () => {
    expect(parseCvmDeliveryDate('')).toBeNull();
    expect(parseCvmDeliveryDate('not-a-date')).toBeNull();
    expect(parseCvmDeliveryDate('2026-15-40')).toBeNull();

    // Far future date (> 24h skew) must be discarded
    const futureDateStr = '2028-12-31';
    expect(parseCvmDeliveryDate(futureDateStr, refDate)).toBeNull();

    // Valid date within window
    const valid = parseCvmDeliveryDate('2026-10-27', refDate);
    expect(valid).not.toBeNull();
    expect(valid?.getUTCFullYear()).toBe(2026);
    expect(valid?.getUTCMonth()).toBe(9); // October
    expect(valid?.getUTCDate()).toBe(27);
  });

  // 11 & 12. Deterministic Raw ID & Zero Math.random()
  it('11 & 12. generates stable deterministic raw ID using protocol or stable sha256 hash without Math.random', () => {
    // With protocol
    const idWithProtocol = generateDeterministicCvmId({
      protocol: '1580679',
      cvmCode: '25704',
      deliveryDate: '2026-10-27',
      category: 'Fato Relevante',
    });
    expect(idWithProtocol).toBe('cvm_1580679');

    // Without protocol: must be a stable deterministic hash
    const idWithoutProtocolA = generateDeterministicCvmId({
      cvmCode: '25704',
      deliveryDate: '2026-10-27',
      category: 'Fato Relevante',
      subject: 'Quinto Plano de Recompra',
    });
    const idWithoutProtocolB = generateDeterministicCvmId({
      cvmCode: '25704',
      deliveryDate: '2026-10-27',
      category: 'Fato Relevante',
      subject: 'Quinto Plano de Recompra',
    });

    expect(idWithoutProtocolA).toBe(idWithoutProtocolB);
    expect(idWithoutProtocolA.startsWith('cvm_')).toBe(true);
    expect(idWithoutProtocolA.length).toBeGreaterThan(10);
  });

  // 13. Partial Provider Status (CVM down + FNET ok)
  it('13. partial provider: CVM failure + FNET success results in OFFICIAL_PROVIDER_PARTIAL', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('dados.cvm.gov.br')) {
        throw new Error('CVM timeout');
      }
      if (url.includes('fnet.bmfbovespa.com.br')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 496277,
                categoriaDocumento: 'Fato Relevante',
                dataEntrega: '25/10/2026 18:09',
                especieDocumento: 'Aviso aos Cotistas',
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    // Query 1 stock (CVM) and 1 FII (FNET)
    const res = await provider.fetchOfficialEvents(['SOJA3', 'HGLG11'], refDate);

    expect(res.cvm.status).toBe('UNAVAILABLE');
    expect(res.fnet.status).toBe('AVAILABLE');
    expect(res.overallStatus).toBe('OFFICIAL_PROVIDER_PARTIAL');
    expect(res.articles).toHaveLength(1);
    expect(res.articles[0]?.ticker).toBe('HGLG11');
    expect(res.perAssetStatus?.['SOJA3']).toBe('PROVIDER_UNAVAILABLE');
    expect(res.perAssetStatus?.['HGLG11']).toBe('OFFICIAL_SOURCE_OK');
  });

  // 15. Both Down -> OFFICIAL_PROVIDER_UNAVAILABLE
  it('15. both providers fail results in OFFICIAL_PROVIDER_UNAVAILABLE', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Total network outage'));

    const provider = new CvmOfficialNewsProvider({
      customCacheDir: testCacheDir,
      fetchFn: mockFetch as any,
    });

    const res = await provider.fetchOfficialEvents(['SOJA3', 'HGLG11'], refDate);

    expect(res.cvm.status).toBe('UNAVAILABLE');
    expect(res.fnet.status).toBe('UNAVAILABLE');
    expect(res.overallStatus).toBe('OFFICIAL_PROVIDER_UNAVAILABLE');
    expect(res.articles).toHaveLength(0);
  });

  // 18. Working Directory Independence
  it('18. resolves cache path from system LOCALAPPDATA / homedir regardless of current process cwd', () => {
    const provider = new CvmOfficialNewsProvider();
    const cacheDir = provider.getCacheDirectory();

    expect(cacheDir).not.toContain('scratch');
    expect(cacheDir).toContain('Atlas');
    expect(cacheDir).toContain('regulatory');
  });

  // 20. FNET Regression Verification
  it('20. FNET FII official parser correctly parses real FNET feed without regression', () => {
    const raw = fnetRecordToRawNews(
      {
        id: 771097,
        categoriaDocumento: 'Assembleia',
        dataEntrega: '04/11/2026 17:32',
        especieDocumento: 'Ata da Assembleia',
      },
      'SNFZ11',
      refDate,
    );

    expect(raw).not.toBeNull();
    expect(raw?.ticker).toBe('SNFZ11');
    expect(raw?.provider).toBe('B3');
    expect(raw?.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(raw?.url).toBe('https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=771097');
  });
});
