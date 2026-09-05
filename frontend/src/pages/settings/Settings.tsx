import { useEffect } from 'react';
import { DeskLayout } from '@/components/layout/DeskLayout';
import StockImport from './StockImport';

export default function Settings() {
  useEffect(() => {
    document.title = 'Fabb6 WMS — Settings';
  }, []);

  return (
    <DeskLayout heading="Settings">
      <StockImport />
    </DeskLayout>
  );
}
