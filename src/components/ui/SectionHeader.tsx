interface Props {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

export function SectionHeader({ title, subtitle, align = 'left' }: Props) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : ''}>
      <h2 className="text-[1.75rem] font-extrabold tracking-[-0.04em] text-[#101828] sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">{subtitle}</p>}
    </div>
  );
}
