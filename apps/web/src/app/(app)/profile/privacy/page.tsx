'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, SectionHeader, Card, Button, Badge } from '@/components/ui';
import { apiClient } from '@/api/client';
import { colors, spacing, borderRadius } from '@atlas/ui';

interface UserConsentItem {
  id: string;
  purpose: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
}

interface DataSubjectRequestItem {
  id: string;
  type: string;
  status: string;
  details?: string | null;
  responseNotes?: string | null;
  requestedAt: string;
  completedAt?: string | null;
}

interface SharingEntity {
  name: string;
  role: string;
  purpose: string;
  legalBasisCandidate: string;
  dataCategories: string[];
  sharingCondition: string;
}

const PURPOSE_LABELS: Record<string, { title: string; description: string }> = {
  AI_GROUNDED_EXPLANATIONS: {
    title: 'Explicações Factuais de Carteira por IA',
    description:
      'Autoriza o motor de inteligência artificial a contextualizar relatórios e responder dúvidas sobre métricas já calculadas. Não altera dados nem substitui motores contábeis.',
  },
  PRODUCT_COMMUNICATIONS: {
    title: 'Comunicações e Avisos de Produto',
    description:
      'Notificações sobre atualizações de segurança, disponibilidade de informes de rendimentos e alertas fiscais essenciais.',
  },
  ANALYTICS_TELEMETRY: {
    title: 'Telemetria Operacional e Desempenho',
    description:
      'Métricas anônimas de latência e estabilidade da interface, utilizadas exclusivamente para aprimoramento da confiabilidade do sistema.',
  },
  INTEGRATION_AUTOMATION: {
    title: 'Automação de Sincronização e Conectores',
    description:
      'Execução em segundo plano de rotinas programadas de atualização de cotações e conciliação de custódia com provedores autorizados.',
  },
};

export default function PrivacyCenterPage() {
  const router = useRouter();

  // State
  const [consents, setConsents] = useState<UserConsentItem[]>([]);
  const [requests, setRequests] = useState<DataSubjectRequestItem[]>([]);
  const [sharingEntities, setSharingEntities] = useState<SharingEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Request Form
  const [selectedDsrType, setSelectedDsrType] = useState<string>('ACCESS');
  const [dsrDetails, setDsrDetails] = useState('');
  const [isSubmittingDsr, setIsSubmittingDsr] = useState(false);
  const [dsrFeedback, setDsrFeedback] = useState<string | null>(null);

  // Deactivation
  const [deactivateConfirmText, setDeactivateConfirmText] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateFeedback, setDeactivateFeedback] = useState<string | null>(null);

  // Load initial privacy data
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setErrorMsg(null);

        const [consentsRes, requestsRes, sharingRes] = await Promise.all([
          apiClient.get<{ data: UserConsentItem[] }>('/api/v1/privacy/consents'),
          apiClient.get<{ data: DataSubjectRequestItem[] }>('/api/v1/privacy/requests'),
          apiClient.get<{ data: { entities: SharingEntity[] } }>('/api/v1/privacy/sharing'),
        ]);

        if (isMounted) {
          setConsents(consentsRes.data || []);
          setRequests(requestsRes.data || []);
          setSharingEntities(sharingRes.data?.entities || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof Error ? err.message : 'Falha ao carregar dados de privacidade.';
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle consent toggle
  const handleToggleConsent = async (purpose: string, currentGranted: boolean) => {
    try {
      const nextGranted = !currentGranted;
      const res = await apiClient.post<{ data: UserConsentItem }>('/api/v1/privacy/consents', {
        purpose,
        granted: nextGranted,
      });

      setConsents((prev) => prev.map((item) => (item.purpose === purpose ? res.data : item)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      alert(`Falha ao atualizar consentimento: ${msg}`);
    }
  };

  // Handle data export download
  const handleDownloadExport = async () => {
    try {
      setIsExporting(true);
      setExportSuccess(false);

      const res = await apiClient.get<{ data: Record<string, unknown> }>('/api/v1/privacy/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atlas-privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro de conexão';
      alert(`Falha na exportação de dados: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle DSR Submission
  const handleSubmitDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingDsr(true);
      setDsrFeedback(null);

      const res = await apiClient.post<{ data: DataSubjectRequestItem }>(
        '/api/v1/privacy/requests',
        {
          type: selectedDsrType,
          details: dsrDetails.trim() || undefined,
        },
      );

      setRequests((prev) => [res.data, ...prev]);
      setDsrDetails('');
      setDsrFeedback('Solicitação de direito do titular registrada com sucesso.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tente novamente';
      setDsrFeedback(`Erro ao registrar solicitação: ${msg}`);
    } finally {
      setIsSubmittingDsr(false);
    }
  };

  // Handle Account Deactivation
  const handleDeactivate = async () => {
    if (deactivateConfirmText !== 'DESATIVAR MINHA CONTA') {
      alert('Por favor, digite exatamente "DESATIVAR MINHA CONTA" para confirmar a operação.');
      return;
    }

    if (
      !window.confirm(
        'ATENÇÃO: Sua conta será desativada e as sessões serão revogadas. Por obrigação fiscal, transações de custódia não são apagadas. Deseja prosseguir?',
      )
    ) {
      return;
    }

    try {
      setIsDeactivating(true);
      setDeactivateFeedback(null);

      await apiClient.post('/api/v1/privacy/account/deactivate', {
        confirmation: 'DESATIVAR MINHA CONTA',
      });

      setDeactivateFeedback(
        'Conta desativada e sessões revogadas com sucesso. Você será redirecionado.',
      );
      setTimeout(() => {
        router.replace('/login');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha operacional';
      setDeactivateFeedback(`Erro na desativação: ${msg}`);
      setIsDeactivating(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: `${spacing.xl * 2}px` }}>
      {/* Header & Back navigation */}
      <div style={{ marginBottom: `${spacing.md}px` }}>
        <Button
          variant="outline"
          onClick={() => router.push('/profile')}
          style={{ minHeight: '44px', marginBottom: `${spacing.sm}px` }}
        >
          ← Voltar ao Perfil
        </Button>
      </div>

      <PageHeader
        title="Central de Privacidade e Proteção de Dados"
        subtitle="Exercício dos direitos do titular sob a LGPD (Lei 13.709/2018), consentimentos granulares e exportação auditada"
      />

      {errorMsg && (
        <Card
          style={{
            marginBottom: `${spacing.lg}px`,
            padding: `${spacing.md}px`,
            borderColor: colors.negative,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
          }}
        >
          <div style={{ color: colors.negative, fontSize: '0.875rem' }}>{errorMsg}</div>
        </Card>
      )}

      {isLoading ? (
        <Card
          style={{ padding: `${spacing.xl}px`, textAlign: 'center', color: colors.textSecondary }}
        >
          Carregando dados de privacidade, consentimentos e histórico...
        </Card>
      ) : (
        <>
          {/* 1. Data Export / Portability */}
          <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
            <SectionHeader
              title="Exportação de Dados Pessoais e Financeiros (Portabilidade / Art. 18, V)"
              description="Gere e faça download de um pacote JSON estruturado com todos os seus dados mantidos no Atlas"
            />

            <div
              style={{
                marginTop: `${spacing.md}px`,
                padding: `${spacing.md}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                O arquivo exportado contém dados cadastrais de perfil, histórico completo de
                carteiras, contas vinculadas, ledger de transações patrimoniais, consentimentos
                registrados e solicitações de privacidade.
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  marginTop: `${spacing.xs}px`,
                  borderLeft: `2px solid ${colors.accent}`,
                  paddingLeft: `${spacing.sm}px`,
                }}
              >
                <strong>Garantia de Segurança Técnica:</strong> Senhas, hashes de tokens e segredos
                criptográficos são rigorosamente excluídos da exportação por proteção contra
                vazamento.
              </div>

              <div
                style={{
                  marginTop: `${spacing.base}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  variant="primary"
                  onClick={handleDownloadExport}
                  isLoading={isExporting}
                  style={{ minHeight: '44px' }}
                >
                  Exportar Meus Dados (JSON)
                </Button>
                {exportSuccess && (
                  <span style={{ fontSize: '0.875rem', color: colors.positive, fontWeight: 500 }}>
                    ✓ Pacote de dados gerado e transferido com sucesso!
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* 2. Granular Consents */}
          <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
            <SectionHeader
              title="Gestão Granular de Consentimentos (Art. 7, I e Art. 8 § 5º)"
              description="Controle individualmente as finalidades opcionais de processamento de dados e revogue a qualquer momento"
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${spacing.md}px`,
                marginTop: `${spacing.md}px`,
              }}
            >
              {consents.map((c) => {
                const meta = PURPOSE_LABELS[c.purpose] || {
                  title: c.purpose,
                  description: 'Finalidade técnica de processamento.',
                };

                return (
                  <div
                    key={c.purpose}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: `${spacing.md}px`,
                      padding: `${spacing.md}px`,
                      borderRadius: `${borderRadius.md}px`,
                      backgroundColor: colors.surfaceElevated,
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <div style={{ flex: '1 1 300px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: `${spacing.sm}px`,
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            color: colors.textPrimary,
                          }}
                        >
                          {meta.title}
                        </span>
                        <Badge variant={c.granted ? 'positive' : 'neutral'}>
                          {c.granted ? 'CONCEDIDO' : 'REVOGADO / INATIVO'}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                        {meta.description}
                      </div>
                      {c.granted && c.grantedAt && (
                        <div
                          style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}
                        >
                          Ativo desde {new Date(c.grantedAt).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                      {!c.granted && c.revokedAt && (
                        <div
                          style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}
                        >
                          Revogado em {new Date(c.revokedAt).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>

                    <div>
                      <Button
                        variant={c.granted ? 'outline' : 'primary'}
                        onClick={() => handleToggleConsent(c.purpose, c.granted)}
                        style={{ minHeight: '44px', minWidth: '130px' }}
                      >
                        {c.granted ? 'Revogar Consentimento' : 'Conceder Consentimento'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 3. Data Subject Requests (DSR) */}
          <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
            <SectionHeader
              title="Exercício de Direitos do Titular (Art. 18 LGPD)"
              description="Abra solicitações formais de acesso, retificação, esclarecimento ou exclusão"
            />

            <form onSubmit={handleSubmitDsr} style={{ marginTop: `${spacing.md}px` }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: `${spacing.md}px`,
                  marginBottom: `${spacing.md}px`,
                }}
              >
                <div>
                  <label
                    htmlFor="dsr-type-select"
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: colors.textPrimary,
                      marginBottom: `${spacing.xs}px`,
                    }}
                  >
                    Tipo de Solicitação:
                  </label>
                  <select
                    id="dsr-type-select"
                    value={selectedDsrType}
                    onChange={(e) => setSelectedDsrType(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textPrimary,
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="ACCESS">Acesso aos Dados (Confirmação)</option>
                    <option value="CORRECTION">Correção de Dados Incompletos ou Inexatos</option>
                    <option value="ANONYMIZATION">Anonimização ou Bloqueio</option>
                    <option value="DELETION">
                      Eliminação de Dados Pessoais (Com ressalva fiscal)
                    </option>
                    <option value="PORTABILITY">Portabilidade dos Dados</option>
                    <option value="CONSENT_REVOCATION">Revogação Ampla de Consentimento</option>
                    <option value="SHARING_INFO">
                      Informação das Entidades com Compartilhamento
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="dsr-details-input"
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: colors.textPrimary,
                      marginBottom: `${spacing.xs}px`,
                    }}
                  >
                    Detalhes ou Justificativa (Opcional):
                  </label>
                  <input
                    id="dsr-details-input"
                    type="text"
                    value={dsrDetails}
                    onChange={(e) => setDsrDetails(e.target.value)}
                    placeholder="Descreva detalhes específicos da sua solicitação..."
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderRadius: `${borderRadius.md}px`,
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textPrimary,
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmittingDsr}
                  style={{ minHeight: '44px' }}
                >
                  Registrar Solicitação
                </Button>
                {dsrFeedback && (
                  <span style={{ fontSize: '0.875rem', color: colors.accent }}>{dsrFeedback}</span>
                )}
              </div>
            </form>

            {/* Requests History Table */}
            <div style={{ marginTop: `${spacing.xl}px` }}>
              <h4
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                  marginBottom: `${spacing.sm}px`,
                }}
              >
                Histórico de Solicitações Registradas
              </h4>

              {requests.length === 0 ? (
                <div
                  style={{
                    padding: `${spacing.lg}px`,
                    textAlign: 'center',
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: `${borderRadius.md}px`,
                    color: colors.textSecondary,
                    fontSize: '0.875rem',
                  }}
                >
                  Nenhuma solicitação de direito registrada até o momento.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: `${spacing.md}px`,
                        borderRadius: `${borderRadius.md}px`,
                        backgroundColor: colors.surfaceElevated,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9rem' }}
                        >
                          {req.type}
                        </span>
                        <Badge
                          variant={
                            req.status === 'COMPLETED'
                              ? 'positive'
                              : req.status === 'PENDING_LEGAL_RETENTION_REVIEW'
                                ? 'warning'
                                : 'primary'
                          }
                        >
                          {req.status === 'PENDING_LEGAL_RETENTION_REVIEW'
                            ? 'RETENÇÃO FISCAL / EM REVISÃO'
                            : req.status}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                        Registrada em {new Date(req.requestedAt).toLocaleString('pt-BR')}
                      </div>
                      {req.details && (
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            color: colors.textSecondary,
                            marginTop: '4px',
                          }}
                        >
                          <strong>Detalhe:</strong> {req.details}
                        </div>
                      )}
                      {req.responseNotes && (
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: colors.textSecondary,
                            marginTop: '6px',
                            backgroundColor: 'rgba(234, 179, 8, 0.08)',
                            padding: `${spacing.xs}px ${spacing.sm}px`,
                            borderRadius: `${borderRadius.sm}px`,
                            borderLeft: `2px solid ${colors.warning}`,
                          }}
                        >
                          <strong>Parecer de Conformidade:</strong> {req.responseNotes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* 4. Data Sharing Transparency */}
          <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
            <SectionHeader
              title="Transparência de Compartilhamento e Operadores"
              description="Relação pública de entidades com as quais dados podem ser compartilhados e suas bases legais"
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${spacing.md}px`,
                marginTop: `${spacing.md}px`,
              }}
            >
              {sharingEntities.map((entity) => (
                <div
                  key={entity.name}
                  style={{
                    padding: `${spacing.md}px`,
                    borderRadius: `${borderRadius.md}px`,
                    backgroundColor: colors.surfaceElevated,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                      flexWrap: 'wrap',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.95rem' }}
                    >
                      {entity.name}
                    </div>
                    <Badge variant="neutral">{entity.role}</Badge>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: colors.textSecondary,
                      marginBottom: '6px',
                    }}
                  >
                    {entity.purpose}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                    <strong>Base Legal Candidata:</strong> {entity.legalBasisCandidate}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '2px' }}>
                    <strong>Condição de Compartilhamento:</strong> {entity.sharingCondition}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 5. Account Deactivation */}
          <Card
            style={{
              padding: `${spacing.xl}px`,
              borderColor: colors.negative,
              backgroundColor: 'rgba(239, 68, 68, 0.04)',
            }}
          >
            <SectionHeader
              title="Desativação de Conta e Retenção Fiscal"
              description="Encerre voluntariamente sua conta sem violação do histórico legal tributário"
            />

            <div style={{ marginTop: `${spacing.md}px` }}>
              <div style={{ fontSize: '0.875rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                A desativação encerra o login e revoga todas as suas sessões ativas imediatamente.
                Conforme determinado pelo Art. 16, I da LGPD c/c legislação tributária (Art. 173 e
                174 do Código Tributário Nacional), as transações de custódia e notas fiscais já
                registradas permanecem sob guarda obrigatória de 5 anos para eventual comprovação
                perante a Receita Federal.
              </div>

              <div style={{ marginTop: `${spacing.md}px`, maxWidth: '480px' }}>
                <label
                  htmlFor="deactivate-confirmation-input"
                  style={{
                    display: 'block',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: colors.negative,
                    marginBottom: `${spacing.xs}px`,
                  }}
                >
                  Digite "DESATIVAR MINHA CONTA" para confirmar:
                </label>
                <input
                  id="deactivate-confirmation-input"
                  type="text"
                  value={deactivateConfirmText}
                  onChange={(e) => setDeactivateConfirmText(e.target.value)}
                  placeholder="DESATIVAR MINHA CONTA"
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: `${borderRadius.md}px`,
                    border: `1px solid ${colors.negative}`,
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    fontSize: '0.875rem',
                    marginBottom: `${spacing.md}px`,
                  }}
                />

                <Button
                  variant="danger"
                  onClick={handleDeactivate}
                  isLoading={isDeactivating}
                  disabled={deactivateConfirmText !== 'DESATIVAR MINHA CONTA'}
                  style={{ minHeight: '44px' }}
                >
                  Confirmar Desativação da Conta
                </Button>

                {deactivateFeedback && (
                  <div
                    style={{
                      marginTop: `${spacing.sm}px`,
                      fontSize: '0.875rem',
                      color: colors.negative,
                      fontWeight: 500,
                    }}
                  >
                    {deactivateFeedback}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
