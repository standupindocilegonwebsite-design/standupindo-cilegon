import { useEffect, useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { Router } from '@/lib/router';
import type { Komika } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { KomikaCard } from '@/components/cards/KomikaCard';
import { PageHeader } from '@/components/PageHeader';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function KomikaPage({ router }: { router: Router }) {
  const [loading, setLoading] = useState(true);
  const [komika, setKomika] = useState<Komika[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('komika').select('id, stage_name, slug, photo, bio, instagram_url, tiktok_url, youtube_url, specialties, status, published, created_at, updated_at').eq('published', true).eq('status', 'active').order('stage_name', { ascending: true });
      setKomika((data as Komika[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => komika.filter((k) => !search || k.stage_name.toLowerCase().includes(search.toLowerCase()) || k.specialties.some((s) => s.toLowerCase().includes(search.toLowerCase()))), [komika, search]);

  return (
    <div className="animate-fade-in">
      <PageHeader router={router} title="Komika" subtitle="Kenali komika dan talent Standupindo Cilegon." />

      <div className="container-app py-8 space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari komika..." className="input-field !pl-11" aria-label="Cari komika" />
        </div>

        {loading ? (
          <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"><LoadingSkeleton count={8} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada komika yang ditemukan." />
        ) : (
          <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((k) => <KomikaCard key={k.id} komika={k} router={router} />)}
          </div>
        )}
      </div>
    </div>
  );
}
