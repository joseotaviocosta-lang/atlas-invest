import { Injectable, Inject } from '@nestjs/common';
import {
  IPrivacyRepository,
  LegalDocumentMetadata,
  LegalDocumentAcceptanceRecord,
  UserConsentRecord,
  DataSubjectRequestRecord,
  UserDataExport,
} from '@atlas/database';
import { PRIVACY_REPOSITORY } from '../../database/tokens';
import {
  AcceptLegalDocumentDto,
  UpdateConsentDto,
  CreateDataSubjectRequestDto,
  ConsentPurposes,
} from './dto/privacy.dto';

export interface DataSharingEntity {
  name: string;
  role: 'CONTROLADOR_CONJUNTO' | 'OPERADOR' | 'ORGAO_PUBLICO' | 'PROVEDOR_PUBLICO';
  purpose: string;
  legalBasisCandidate: string;
  dataCategories: string[];
  sharingCondition: string;
}

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PRIVACY_REPOSITORY)
    private readonly privacyRepo: IPrivacyRepository,
  ) {}

  getDocuments(): LegalDocumentMetadata[] {
    return [
      {
        type: 'TERMS_OF_SERVICE',
        title: 'Termos de Uso e Condições de Serviço',
        version: '1.0.0',
        effectiveDate: '2026-10-28',
        draftWatermark: 'DRAFT — LEGAL REVIEW REQUIRED — NOT FOR PRODUCTION PUBLICATION',
        legalNotice:
          'Documento em formato preliminar técnico para readiness LGPD. Pendente de validação por assessoria jurídica antes de publicação em produção.',
      },
      {
        type: 'PRIVACY_POLICY',
        title: 'Política de Privacidade e Proteção de Dados Pessoais',
        version: '1.0.0',
        effectiveDate: '2026-10-28',
        draftWatermark: 'DRAFT — LEGAL REVIEW REQUIRED — NOT FOR PRODUCTION PUBLICATION',
        legalNotice:
          'Documento preliminar técnico alinhado à Lei Geral de Proteção de Dados (Lei 13.709/2018). Pendente de validação por assessoria jurídica externa.',
      },
    ];
  }

  async getAcceptances(userId: string): Promise<LegalDocumentAcceptanceRecord[]> {
    return this.privacyRepo.listAcceptances(userId);
  }

  async acceptDocument(
    userId: string,
    dto: AcceptLegalDocumentDto,
    clientIp?: string | null,
    userAgent?: string | null,
  ): Promise<LegalDocumentAcceptanceRecord> {
    return this.privacyRepo.recordAcceptance({
      userId,
      documentType: dto.documentType,
      documentVersion: dto.version,
      clientIp,
      userAgent,
    });
  }

  async getConsents(userId: string): Promise<UserConsentRecord[]> {
    const recorded = await this.privacyRepo.listConsents(userId);
    const recordedMap = new Map(recorded.map((c) => [c.purpose, c]));

    // Guarantee that all 4 defined purposes exist in the response
    return ConsentPurposes.map((purpose) => {
      const existing = recordedMap.get(purpose);
      if (existing) return existing;

      return {
        id: `virtual-${purpose}`,
        userId,
        purpose,
        granted: false,
        grantedAt: null,
        revokedAt: null,
        clientIp: null,
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }

  async updateConsent(
    userId: string,
    dto: UpdateConsentDto,
    clientIp?: string | null,
    userAgent?: string | null,
  ): Promise<UserConsentRecord> {
    return this.privacyRepo.upsertConsent({
      userId,
      purpose: dto.purpose,
      granted: dto.granted,
      clientIp,
      userAgent,
    });
  }

  async getRequests(userId: string): Promise<DataSubjectRequestRecord[]> {
    return this.privacyRepo.listRequests(userId);
  }

  async createRequest(
    userId: string,
    dto: CreateDataSubjectRequestDto,
  ): Promise<DataSubjectRequestRecord> {
    return this.privacyRepo.createRequest({
      userId,
      type: dto.type,
      details: dto.details,
    });
  }

  async deactivateAccount(userId: string): Promise<{ deactivated: boolean; message: string }> {
    return this.privacyRepo.deactivateAccount(userId);
  }

  async exportData(userId: string): Promise<UserDataExport> {
    return this.privacyRepo.exportUserData(userId);
  }

  getSharingInventory(): { entities: DataSharingEntity[]; principles: string[] } {
    return {
      principles: [
        'Transparência ativa sobre todo e qualquer compartilhamento de dados.',
        'Minimização estrita: provedores externos recebem exclusivamente o payload mínimo necessário à finalidade declarada.',
        'Zero comercialização: O Project Atlas NÃO vende, aluga ou cede dados pessoais ou financeiros a corretores de dados ou parceiros de publicidade.',
        'Isolamento de credenciais: senhas, hashes de tokens e chaves criptográficas NUNCA são transmitidos a operadores externos.',
      ],
      entities: [
        {
          name: 'B3 S.A. — Brasil, Bolsa, Balcão',
          role: 'CONTROLADOR_CONJUNTO',
          purpose:
            'Sincronização e conciliação de custódia e notas de negociação de ativos registrados.',
          legalBasisCandidate:
            'Execução de Contrato (Art. 7, V) e Consentimento Específico (Art. 7, I)',
          dataCategories: [
            'Identificador de investidor (quando autorizado)',
            'Posições de custódia',
            'Negociações em bolsa',
          ],
          sharingCondition:
            'Exclusivamente quando o investidor conecta explicitamente suas credenciais de integração CEI/B3.',
        },
        {
          name: 'Secretaria Especial da Receita Federal do Brasil (RFB)',
          role: 'ORGAO_PUBLICO',
          purpose:
            'Cumprimento de obrigações tributárias, apuração fiscal de ganho de capital e emissão de DARF.',
          legalBasisCandidate: 'Cumprimento de Obrigação Legal ou Regulatória (Art. 7, II)',
          dataCategories: [
            'CPF (quando informado)',
            'Cálculos de rendimentos tributáveis e isentos',
            'Prejuízos acumulados e DARF',
          ],
          sharingCondition:
            'Apuração e emissão efetuadas localmente no sistema; transmissão oficial à RFB apenas por comando expresso do contribuinte no IRPF.',
        },
        {
          name: 'Provedores de Cotações e Indicadores (Banco Central do Brasil / Brapi / Yahoo)',
          role: 'PROVEDOR_PUBLICO',
          purpose:
            'Consulta de preços de fechamento, taxas macroeconômicas (CDI, IPCA, SELIC) e câmbio oficial.',
          legalBasisCandidate: 'Legítimo Interesse (Art. 7, IX) e Execução de Contrato (Art. 7, V)',
          dataCategories: [
            'Tickers de mercado (dados públicos de ativos; NENHUM dado pessoal ou de saldo é transmitido)',
          ],
          sharingCondition:
            'Requisições anônimas de dados de mercado sem qualquer vínculo com a identidade do investidor.',
        },
        {
          name: 'Provedores de Inteligência Artificial (Google Vertex AI / Gemini)',
          role: 'OPERADOR',
          purpose:
            'Explicações contextuais factuais de relatórios e esclarecimentos de métricas financeiras sobre dados locais auditados.',
          legalBasisCandidate: 'Consentimento Granular do Titular (Art. 7, I)',
          dataCategories: [
            'Contexto agregado de posições e rentabilidade estritamente necessário à pergunta do usuário',
          ],
          sharingCondition:
            'Depende de consentimento prévio e ativo para "AI_GROUNDED_EXPLANATIONS". Senhas, CPF e dados bancários são rigorosamente filtrados.',
        },
      ],
    };
  }
}
