'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { ConfirmModal, Modal } from '@/components/modal';
import { Badge, Button, Card, CardBody, CardHeader, PageShell, Select, TextInput, useToast } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Certificate = {
  id: string;
  name: string;
  format: 'pem' | 'pfx';
  notAfter: string | null;
  createdAt: string;
  updatedAt: string;
};

function errorMessage(e: unknown) {
  if (!e || typeof e !== 'object') return 'Falha';
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' && msg.trim() ? msg : 'Falha';
}

async function readFileText(file: File): Promise<string> {
  return await file.text();
}

async function readFileBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fmtDate(dt: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

export default function CertificatesPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['certificates'],
    queryFn: () => apiFetch<Certificate[]>('/admin/certificates'),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Certificate | null>(null);

  const [name, setName] = useState('');
  const [format, setFormat] = useState<'pem' | 'pfx'>('pem');
  const [pemCertFile, setPemCertFile] = useState<File | null>(null);
  const [pemKeyFile, setPemKeyFile] = useState<File | null>(null);
  const [pemCaFile, setPemCaFile] = useState<File | null>(null);
  const [pemPassphrase, setPemPassphrase] = useState('');
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [pfxPassphrase, setPfxPassphrase] = useState('');
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    confirmText?: string;
    details?: React.ReactNode;
    onConfirm: () => void;
  }>(null);

  const reset = () => {
    setEditing(null);
    setName('');
    setFormat('pem');
    setPemCertFile(null);
    setPemKeyFile(null);
    setPemCaFile(null);
    setPemPassphrase('');
    setPfxFile(null);
    setPfxPassphrase('');
  };

  const beginCreate = () => {
    reset();
    setOpen(true);
  };

  const beginEdit = (c: Certificate) => {
    reset();
    setEditing(c);
    setName(c.name);
    setFormat(c.format);
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error('Nome é obrigatório.');

      if (format === 'pem') {
        if (!pemCertFile && !editing) throw new Error('Envie o certificado (PEM).');
        if (!pemKeyFile && !editing) throw new Error('Envie a chave privada (PEM).');
        const payload: {
          name: string;
          format: 'pem';
          pemCert?: string;
          pemKey?: string;
          caPem?: string;
          pemPassphrase?: string;
        } = { name: n, format: 'pem' };
        if (pemCertFile) payload.pemCert = (await readFileText(pemCertFile)).trim();
        if (pemKeyFile) payload.pemKey = (await readFileText(pemKeyFile)).trim();
        if (pemCaFile) payload.caPem = (await readFileText(pemCaFile)).trim();
        if (pemPassphrase.trim()) payload.pemPassphrase = pemPassphrase.trim();
        if (editing) {
          return apiFetch<Certificate>(`/admin/certificates/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        }
        return apiFetch<Certificate>('/admin/certificates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      if (!pfxFile && !editing) throw new Error('Envie o arquivo PFX/P12.');
      const payload: {
        name: string;
        format: 'pfx';
        pfxBase64?: string;
        pfxPassphrase?: string;
      } = { name: n, format: 'pfx' };
      if (pfxFile) payload.pfxBase64 = await readFileBase64(pfxFile);
      if (pfxPassphrase.trim()) payload.pfxPassphrase = pfxPassphrase.trim();
      if (editing) {
        return apiFetch<Certificate>(`/admin/certificates/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<Certificate>('/admin/certificates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      toast.success('Salvo', 'Certificado atualizado.');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['certificates'] });
    },
    onError: (e: unknown) => toast.error('Erro ao salvar', errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/certificates/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Removido', 'Certificado deletado.');
      await qc.invalidateQueries({ queryKey: ['certificates'] });
    },
    onError: (e: unknown) => toast.error('Erro ao remover', errorMessage(e)),
  });

  const askDelete = useCallback((c: Certificate) => {
    setConfirm({
      title: 'Confirmar exclusão',
      description: 'Esta ação é irreversível. Ao confirmar, o certificado será apagado permanentemente.',
      confirmText: 'Deletar',
      details: (
        <div className="grid gap-1 text-xs text-white/75">
          <div className="font-medium text-white/85">{c.name}</div>
          <div className="text-white/55">
            {c.format.toUpperCase()} • validade: {fmtDate(c.notAfter)}
          </div>
        </div>
      ),
      onConfirm: () => {
        setConfirm(null);
        del.mutate(c.id);
      },
    });
  }, [del]);

  return (
    <PageShell
      title="Certificados"
      subtitle="Certificados de cliente (mTLS) para chamadas upstream."
      right={<Button onClick={beginCreate}>Enviar Certificado</Button>}
    >
      <Card>
        <CardHeader
          title="Certificados"
          description="Mostra formato e validade."
          right={<div className="text-xs text-white/55">{q.isPending ? 'Carregando…' : `${rows.length} itens`}</div>}
        />
        <CardBody>
          <DataTable<Certificate>
            rows={rows}
            keyField={(r) => r.id}
            columns={[
              { key: 'name', header: 'Nome', render: (r) => <div className="font-medium text-white/90">{r.name}</div>, sortValue: (r) => r.name, filterValue: (r) => r.name },
              { key: 'format', header: 'Formato', render: (r) => <Badge tone="neutral">{r.format.toUpperCase()}</Badge>, sortValue: (r) => r.format, filterValue: (r) => r.format },
              { key: 'notAfter', header: 'Validade', render: (r) => <div className="text-white/80">{fmtDate(r.notAfter)}</div>, sortValue: (r) => r.notAfter ?? '', filterValue: (r) => r.notAfter ?? '' },
              {
                key: 'actions',
                header: 'Actions',
                render: (r) => (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => beginEdit(r)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => askDelete(r)} disabled={del.isPending}>
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
            mobileCard={(r) => (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-white/90">{r.name}</div>
                  <Badge tone="neutral">{r.format.toUpperCase()}</Badge>
                </div>
                <div className="text-xs text-white/60">Validade: {fmtDate(r.notAfter)}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => beginEdit(r)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => askDelete(r)} disabled={del.isPending}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
            empty="Sem certificados ainda."
          />
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar Certificado' : 'Enviar Certificado'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Nome</div>
            <div className="mt-2">
              <TextInput value={name} onChange={setName} placeholder="Ex: Banco X - mTLS" />
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-medium text-white/70">Formato</div>
            <div className="mt-2">
              <Select
                value={format}
                onChange={(v) => setFormat(v as 'pem' | 'pfx')}
                options={[
                  { value: 'pem', label: 'PEM (cert + key)' },
                  { value: 'pfx', label: 'PFX/P12' },
                ]}
              />
            </div>
          </div>

          {format === 'pem' ? (
            <>
              <div>
                <div className="text-xs font-medium text-white/70">Certificado (PEM)</div>
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pem,.crt,.cer"
                    onChange={(e) => setPemCertFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white/80"
                  />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">Chave privada (PEM)</div>
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pem,.key"
                    onChange={(e) => setPemKeyFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white/80"
                  />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">CA (opcional)</div>
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pem,.crt,.cer"
                    onChange={(e) => setPemCaFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white/80"
                  />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-white/70">Passphrase da chave (opcional)</div>
                <div className="mt-2">
                  <TextInput value={pemPassphrase} onChange={setPemPassphrase} type="password" placeholder="(vazio)" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-white/70">Arquivo PFX/P12</div>
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(e) => setPfxFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white/80"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs font-medium text-white/70">Senha (se houver)</div>
                <div className="mt-2">
                  <TextInput value={pfxPassphrase} onChange={setPfxPassphrase} type="password" placeholder="(vazio)" />
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmText={confirm?.confirmText ?? 'Confirmar'}
        confirmDisabled={del.isPending}
        onConfirm={() => confirm?.onConfirm()}
      >
        {confirm?.details ?? null}
      </ConfirmModal>
    </PageShell>
  );
}
