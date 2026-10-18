import { useEffect, useState } from 'react';
import type { Router } from '@/lib/router';
import { loadAnnualRecapStats, type AnnualRecapRecord, type AnnualRecapStats } from '@/lib/annual-recap';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnnualRecapStory } from '@/pages/public/AnnualRecapStoryView';
import { seoDescription, setPageMetadata } from '@/lib/seo';

const LOADING_RECAP_PHOTO = '/assets/images/Loading%20Annual%20Recap2.jfif';

export function AnnualRecapPage({ router, year }: { router: Router; year: string }) {
  const [record, setRecord] = useState<AnnualRecapRecord | null>(null);
  const [stats, setStats] = useState<AnnualRecapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const yearNumber = Number(year);
  const validYear = /^\d{4}$/.test(year) && Number.isInteger(yearNumber) && yearNumber >= 1900;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecord(null);
    setStats(null);
    setLoadError(false);

    if (!validYear) {
      setLoading(false);
      return () => { active = false; };
    }

    void (async () => {
      let recapResult = await supabase
        .from('annual_recaps')
        .select('id, year, published, closing_narrative, music_url')
        .eq('year', yearNumber)
        .eq('published', true)
        .maybeSingle();

      if (recapResult.error?.code === '42703') {
        recapResult = await supabase
          .from('annual_recaps')
          .select('id, year, published, closing_narrative')
          .eq('year', yearNumber)
          .eq('published', true)
          .maybeSingle();
      }

      if (!active) return;
      const { data, error } = recapResult;
      if (error) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      const recap = (data as AnnualRecapRecord | null) ?? null;
      setRecord(recap);
      if (!recap) {
        setLoading(false);
        return;
      }
      setPageMetadata({
        path: `/recap/${recap.year}`,
        title: `Annual Recap ${recap.year} | Standupindo Cilegon`,
        description: seoDescription(recap.closing_narrative, `Lihat kilas balik kegiatan, panggung, dan cerita Standupindo Cilegon pada ${recap.year}.`),
      });

      try {
        const nextStats = await loadAnnualRecapStats(yearNumber);
        if (active) setStats(nextStats);
      } catch {
        if (active) setLoadError(true);
      }
      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [validYear, yearNumber]);

  if (loading) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#071a35] px-6 text-white" role="status" aria-live="polite">
        <img src={LOADING_RECAP_PHOTO} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#041026]/65 via-[#041026]/45 to-[#041026]/75" aria-hidden="true" />
        <div className="absolute inset-x-0 top-[7%] z-10 flex flex-col items-center px-6 text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <img src="/assets/images/standup-indo-logo.png" alt="Logo Standupindo" className="h-auto w-32 object-contain drop-shadow-md" />
          <p className="text-[10px] font-extrabold uppercase text-cyan-200">MEMUAT</p>
          <p className="mt-1 text-2xl font-black uppercase leading-none text-white">JEJAK TAWA</p>
          <p className="mt-1 text-xs font-bold uppercase text-blue-100">STANDUPINDO CILEGON</p>
        </div>
      </div>
    );
  }

  if (loadError || !record || !stats) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-md pt-20">
          <EmptyState
            title={loadError ? 'Annual Recap gagal dimuat' : 'Recap tidak tersedia'}
            description={loadError ? 'Periksa koneksi lalu coba kembali.' : `Annual Recap ${year} belum dipublikasikan atau belum dibuat.`}
            noSmokeArea
          />
          <button type="button" onClick={() => router.navigate('/')} className="mx-auto mt-5 block text-sm font-semibold text-cyan-200">Kembali ke beranda</button>
        </div>
      </div>
    );
  }

  return (
    <AnnualRecapStory
      year={record.year}
      stats={stats}
      closingNarrative={record.closing_narrative}
      musicUrl={record.music_url ?? null}
      onClose={() => router.navigate('/')}
    />
  );
}