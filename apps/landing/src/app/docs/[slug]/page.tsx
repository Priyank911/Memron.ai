import { notFound } from 'next/navigation';
import { DOC_ITEMS } from '@/lib/docs-content';
import { DocViewer } from '@/components/doc-viewer';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return Object.keys(DOC_ITEMS).map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = DOC_ITEMS[slug];
  if (!doc) {
    return {
      title: 'Docs — Memron.ai',
    };
  }

  return {
    title: `${doc.title} — Memron Documentation`,
    description: doc.description,
  };
}

export default async function DocSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = DOC_ITEMS[slug];

  if (!doc) {
    notFound();
  }

  return <DocViewer doc={doc} />;
}
