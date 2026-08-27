import { DOC_ITEMS } from '@/lib/docs-content';
import { DocViewer } from '@/components/doc-viewer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation — Memron.ai',
  description: 'Complete documentation for Memron.ai context intelligence, 7-layer memory architecture, and 41 MCP tools.',
};

export default function DocsRootPage() {
  const introDoc = DOC_ITEMS['introduction'];
  return <DocViewer doc={introDoc} />;
}
