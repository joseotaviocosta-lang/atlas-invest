import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { Card, Button } from '../../../components/ui';
import { detectClientSourceType, formatBytes } from '../helpers';
import type { ClientSourceHint } from '../types';

export interface SelectedFilePayload {
  name: string;
  size: number;
  content: string;
  isXlsx: boolean;
  hint: ClientSourceHint;
}

export interface FileDropzoneProps {
  onFileSelect: (payload: SelectedFilePayload) => void;
  onClear: () => void;
  selectedFile: SelectedFilePayload | null;
  isLoading?: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileSelect,
  onClear,
  selectedFile,
  isLoading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setErrorMessage(null);

    const nameLower = file.name.toLowerCase();
    const isCsv = nameLower.endsWith('.csv');
    const isXlsx =
      nameLower.endsWith('.xlsx') ||
      file.type.includes('spreadsheetml') ||
      file.type.includes('excel');

    if (!isCsv && !isXlsx) {
      setErrorMessage('Extensão de arquivo não suportada. Selecione um arquivo .CSV ou .XLSX.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(
        `Arquivo excede o limite máximo de 2 MB (${formatBytes(file.size)}). Reduza o tamanho ou filtre o período.`
      );
      return;
    }

    try {
      let content = '';
      if (isXlsx) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        content = btoa(binary);
      } else {
        content = await file.text();
      }

      const hint = detectClientSourceType(file.name, isXlsx);

      onFileSelect({
        name: file.name,
        size: file.size,
        content,
        isXlsx,
        hint,
      });
    } catch {
      setErrorMessage('Falha ao ler o arquivo selecionado. Tente novamente.');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    if (files.length > 1) {
      setErrorMessage('Selecione apenas 1 arquivo por importação.');
      return;
    }

    const file = files[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file) {
      await processFile(file);
    }
    // reset input so same file can be selected again if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card style={{ padding: `${spacing.xl}px` }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {selectedFile ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: `${spacing.md}px`,
            padding: `${spacing.md}px ${spacing.lg}px`,
            backgroundColor: `${colors.accent}0A`,
            border: `1px solid ${colors.accent}40`,
            borderRadius: `${borderRadius.md}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
            <div
              style={{
                fontSize: '1.75rem',
                lineHeight: 1,
              }}
            >
              {selectedFile.isXlsx ? '📊' : '📄'}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.9375rem' }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                {formatBytes(selectedFile.size)} · {selectedFile.hint.formatName}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
            >
              Trocar arquivo
            </Button>
            <Button
              variant="secondary"
              onClick={onClear}
              disabled={isLoading}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: colors.negative }}
            >
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? colors.accent : colors.border}`,
            backgroundColor: isDragging ? `${colors.accent}0F` : 'transparent',
            borderRadius: `${borderRadius.lg}px`,
            padding: `${spacing.xxl}px ${spacing.xl}px`,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background-color 0.15s ease',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: `${spacing.sm}px` }}>
            {isDragging ? '📥' : '📂'}
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: '1rem',
              color: colors.textPrimary,
              marginBottom: `${spacing.xs}px`,
            }}
          >
            Arraste seu arquivo aqui ou clique para selecionar
          </div>
          <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
            Formatos suportados: <strong>.CSV</strong> (Extratos e operações) ou{' '}
            <strong>.XLSX</strong> (Negociação, Movimentação ou Consolidado Anual B3)
          </div>
          <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: `${spacing.xs}px` }}>
            Tamanho máximo: 2 MB por arquivo
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginTop: `${spacing.md}px`,
            padding: `${spacing.md}px`,
            backgroundColor: `${colors.negative}15`,
            border: `1px solid ${colors.negative}40`,
            borderRadius: `${borderRadius.md}px`,
            color: colors.negative,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
          }}
        >
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}
    </Card>
  );
};
