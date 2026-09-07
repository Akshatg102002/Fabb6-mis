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
}

const EMPTY_FORM: VendorForm = {
  name: '',
  vendor_code: '',
  gstin: '',
  city: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  address: '',
};

function field(label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; required?: boolean; type?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{opts?.required && <span style={{ color: 'var(--scan-error)' }}> *</span>}
      </label>
      <input
        type={opts?.type ?? 'text'}
        value={value}
        placeholder={opts?.placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: '40px',
          padding: '0 10px',
          fontSize: '14px',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          backgroundColor: 'var(--surface-sunken)',
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

export default function Vendors() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);

  const { data: vendors, isLoading, error } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => apiClient<Vendor[]>('/vendors'),
  });

  const createVendor = useMutation({
    mutationFn: (body: VendorForm) =>
      apiClient('/vendors', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  function set(key: keyof VendorForm) {
    return (v: string) => setForm((f) => ({ ...f, [key]: v }));
  }

  return (
    <DeskLayout
      heading="Vendors"
      breadcrumbs={[{ label: 'Home', to: '/home' }, { label: 'Vendors' }]}
      toolbar={
        <Button variant="primary" size="md" onClick={() => setShowModal(true)}>
          + Add Vendor
        </Button>
      }
    >
      {isLoading && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>Loading…</p>
      )}

      {error && (
        <p style={{ color: 'var(--scan-error)', textAlign: 'center' }}>Failed to load vendors.</p>
      )}

      {vendors && vendors.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '4rem 0' }}>
          No vendors yet. Click "Add Vendor" to create one.
        </div>
      )}

      {vendors && vendors.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Code', 'Name', 'City', 'GST Number', 'Email', 'Status'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr
                  key={v.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-sunken)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', color: 'var(--text-muted)' }}>
                    {v.vendor_code ?? '—'}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{v.city ?? '—'}</td>
                  <td style={{ padding: '12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px' }}>{v.gstin ?? '—'}</td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{v.email ?? '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: v.is_active ? '#E8F7F0' : '#F5F7FA',
                        color: v.is_active ? '#0E8A4F' : '#5A6884',
                      }}
                    >
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Vendor Modal */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setForm(EMPTY_FORM); } }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90dvh',
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Add Vendor</h2>

            {field('Company Name', form.name, set('name'), { required: true, placeholder: 'Acme Supplies Pvt Ltd' })}
            {field('Vendor Code', form.vendor_code, set('vendor_code'), { placeholder: 'SUP-001' })}
            {field('GST Number', form.gstin, set('gstin'), { placeholder: '29ABCDE1234F1Z5' })}
            {field('City', form.city, set('city'), { placeholder: 'Mumbai' })}
            {field('Contact Person', form.contact_name, set('contact_name'), { placeholder: 'Ravi Kumar' })}
            {field('Phone', form.contact_phone, set('contact_phone'), { type: 'tel', placeholder: '+91 98765 43210' })}
            {field('Email', form.contact_email, set('contact_email'), { type: 'email', placeholder: 'ravi@acme.com' })}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Address
              </label>
              <textarea
                value={form.address}
                onChange={(e) => set('address')(e.target.value)}
                placeholder="Street, City, State, PIN"
                rows={3}
                style={{
                  padding: '8px 10px',
                  fontSize: '14px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--surface-sunken)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {createVendor.isError && (
              <p style={{ margin: 0, color: 'var(--scan-error)', fontSize: '13px' }}>
                Failed to create vendor. Please try again.
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={createVendor.isPending}
                disabled={!form.name.trim()}
                onClick={() => createVendor.mutate(form)}
              >
                Create Vendor
              </Button>
            </div>
          </div>
        </div>
      )}
    </DeskLayout>
  );
}
