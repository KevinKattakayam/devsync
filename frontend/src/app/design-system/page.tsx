import { notFound } from 'next/navigation';
import { DesignSystem } from './workbench';
export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DesignSystem />;
}
