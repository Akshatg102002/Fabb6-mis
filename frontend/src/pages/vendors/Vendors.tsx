import { useState } from 'react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import { Button } from '@/components/ui/Button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

interface Vendor {
  id: string;
  vendor_code: string | null;
  name: string;
  gstin: string | null;
  city: string | null;
  email: string | null;
  is_active: boolean;
}


interface VendorForm {
  name: string;
  vendor_code: string;
  gstin: string;
  city: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  is_active: boolean;
}

const EMPTY_FORM: VendorForm = {
  name: '', vendor_code: '', gstin: '', city: '',
  contact_name: '', contact_phone: '', contact_email: '', address: '', is_active: true,
};

// ── Slide-over panel ────────────────────────────────────────────────────────

function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.35)' }}
          aria-hidden="true"
        />
      )}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          maxWidth: '100vw',
          zIndex: 50,
          backgroundColor: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 240ms ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)', padding: '4px', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: 'var(--scan-error)' }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: '38px', padding: '0 10px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: disabled ? 'var(--surface-sunken)' : 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', opacity: disabled ? 0.7 : 1 }}
      />
    </div>
  );
}

// ── Vendor form (used in both create and edit panels) ─────────────────────

function VendorFormFields({
  form,
  set,
  disabled,
  hideCode,
}: {
  form: VendorForm;
  set: (k: keyof VendorForm) => (v: string) => void;
  disabled?: boolean;
  hideCode?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Company Name" value={form.name} onChange={set('name')} placeholder="Acme Supplies Pvt Ltd" required disabled={disabled} />
      {!hideCode && <Field label="Vendor Code" value={form.vendor_code} onChange={set('vendor_code')} placeholder="SUP-001" disabled={disabled} />}
      <Field label="GST Number" value={form.gstin} onChange={set('gstin')} placeholder="29ABCDE1234F1Z5" disabled={disabled} />
      <Field label="City" value={form.city} onChange={set('city')} placeholder="Mumbai" disabled={disabled} />
      <Field label="Contact Person" value={form.contact_name} onChange={set('contact_name')} placeholder="Ravi Kumar" disabled={disabled} />
      <Field label="Phone" value={form.contact_phone} onChange={set('contact_phone')} type="tel" placeholder="+91 98765 43210" disabled={disabled} />
      <Field label="Email" value={form.contact_email} onChange={set('contact_email')} type="email" placeholder="ravi@acme.com" disabled={disabled} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Address</label>
        <textarea
          value={form.address}
          onChange={(e) => set('address')(e.target.value)}
          placeholder="Street, City, State, PIN"
          rows={3}
          disabled={disabled}
          style={{ padding: '8px 10px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: disabled ? 'var(--surface-sunken)' : 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', opacity: disabled ? 0.7 : 1 }}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Vendors() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [createForm, setCreateForm] = useState<VendorForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<VendorForm>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: vendors, isLoading, error: fetchError } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => apiClient<Vendor[]>('/vendors'),
  });

  const { data: nextCode } = useQuery<{ code: string }>({
    queryKey: ['vendors', 'next-code'],
    queryFn: () => apiClient<{ code: string }>('/vendors/next-code'),
    staleTime: 0,
    enabled: showCreate,
  });

  const createVendor = useMutation({
    mutationFn: (body: Omit<VendorForm, 'is_active'>) =>
      apiClient('/vendors', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      setError('');
    },
    onError: () => setError('Failed to create vendor.'),
  });

  const updateVendor = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<VendorForm> }) =>
      apiClient(`/vendors/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      setEditVendor(null);
      setError('');
    },
    onError: () => setError('Failed to update vendor.'),
  });

  const deleteVendor = useMutation({
    mutationFn: (id: string) => apiClient(`/vendors/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      setEditVendor(null);
      setDeleteConfirm(null);
    },
    onError: () => setError('Failed to deactivate vendor.'),
  });

  function setCreate(key: keyof VendorForm) {
    return (v: string) => setCreateForm((f) => ({ ...f, [key]: v }));
  }

  function setEdit(key: keyof VendorForm) {
    return (v: string) => setEditForm((f) => ({ ...f, [key]: v }));
  }

  function openEdit(v: Vendor) {
    setEditVendor(v);
    setEditForm({
      name: v.name,
      vendor_code: v.vendor_code ?? '',
      gstin: v.gstin ?? '',
      city: v.city ?? '',
      contact_name: '',
      contact_phone: '',
      contact_email: v.email ?? '',
      address: '',
      is_active: v.is_active,
    });
    setError('');
  }

  const filtered = (vendors ?? []).filter((v) =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) || (v.vendor_code ?? '').toLowerCase().includes(search.toLowerCase()) || (v.city ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <DeskLayout
      heading="Vendors"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Vendors' }]}
      toolbar={
        <Button variant="primary" size="md" onClick={() => { setShowCreate(true); setError(''); }}>
          + Add Vendor
        </Button>
      }
    >
      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="search"
          placeholder="Search by name, code, city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ height: '36px', padding: '0 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', width: '280px', maxWidth: '100%' }}
        />
      </div>

      {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>}
      {fetchError && <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load vendors.</p>}

      {filtered.length === 0 && !isLoading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem 0' }}>
          {search ? 'No vendors match your search.' : 'No vendors yet. Click "Add Vendor" to create one.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: 'var(--surface)' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--surface-sunken)' }}>
                {['Code', 'Name', 'City', 'GST Number', 'Email', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr
                  key={v.id}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-sunken)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent')}
                  onClick={() => openEdit(v)}
                >
                  <td style={{ padding: '12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: 'var(--text-muted)' }}>{v.vendor_code ?? '—'}</td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{v.city ?? '—'}</td>
                  <td style={{ padding: '12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px' }}>{v.gstin ?? '—'}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{v.email ?? '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: v.is_active ? '#E8F7F0' : '#F5F7FA', color: v.is_active ? '#0E8A4F' : '#5A6884' }}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                      style={{ fontSize: '12px', color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontFamily: 'inherit' }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create slide-over */}
      <SlideOver open={showCreate} onClose={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); setError(''); }} title="Add Vendor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Auto-generated vendor code — read only */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vendor Code</label>
            <input
              type="text"
              value={nextCode?.code ?? 'Generating…'}
              readOnly
              style={{ height: '38px', padding: '0 10px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--surface-sunken)', color: 'var(--brand-primary)', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, cursor: 'default' }}
            />
          </div>
          <VendorFormFields form={createForm} set={setCreate} hideCode />
          {error && <p style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <Button variant="ghost" size="md" onClick={() => { setShowCreate(false); setCreateForm(EMPTY_FORM); setError(''); }}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={createVendor.isPending}
              disabled={!createForm.name.trim()}
              onClick={() => createVendor.mutate({ ...createForm, vendor_code: nextCode?.code ?? createForm.vendor_code })}
            >
              Create Vendor
            </Button>
          </div>
        </div>
      </SlideOver>

      {/* Edit slide-over */}
      <SlideOver open={!!editVendor} onClose={() => { setEditVendor(null); setDeleteConfirm(null); setError(''); }} title={editVendor?.name ?? 'Edit Vendor'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <VendorFormFields form={editForm} set={setEdit} />
          {error && <p style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <Button variant="ghost" size="md" onClick={() => { setEditVendor(null); setDeleteConfirm(null); setError(''); }}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={updateVendor.isPending}
              disabled={!editForm.name.trim()}
              onClick={() => editVendor && updateVendor.mutate({ id: editVendor.id, body: editForm })}
            >
              Save Changes
            </Button>
          </div>

          {/* Deactivate section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            {deleteConfirm === editVendor?.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)' }}>
                  Deactivate <strong>{editVendor?.name}</strong>? They will no longer appear in supplier dropdowns.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={deleteVendor.isPending}
                    onClick={() => editVendor && deleteVendor.mutate(editVendor.id)}
                    style={{ backgroundColor: 'var(--scan-error)', borderColor: 'var(--scan-error)' }}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(editVendor?.id ?? null)}
                style={{ fontSize: '13px', color: 'var(--scan-error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
              >
                Deactivate vendor…
              </button>
            )}
          </div>
        </div>
      </SlideOver>
    </DeskLayout>
  );
}
