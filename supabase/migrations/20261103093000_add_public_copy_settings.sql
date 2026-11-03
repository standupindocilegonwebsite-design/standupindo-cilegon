ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS home_hero_title text,
  ADD COLUMN IF NOT EXISTS home_hero_description text,
  ADD COLUMN IF NOT EXISTS footer_description text;

UPDATE public.site_settings
SET
  home_hero_title = COALESCE(home_hero_title, 'Komunitas Stand Up Comedy Cilegon'),
  home_hero_description = COALESCE(
    home_hero_description,
    'Dari Tawa, Jadi Karya. Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.'
  ),
  footer_description = COALESCE(
    footer_description,
    'Menjadi ruang bertemunya komika, penikmat komedi, dan insan kreatif untuk berbagi tawa, mengembangkan potensi, serta membangun ekosistem stand up comedy di Cilegon.'
  )
WHERE id = 1;
