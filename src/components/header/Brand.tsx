import { useTranslation } from 'react-i18next';

import { brand } from '~/design/tokens';

/**
 * The Axiovel mark: the wing glyph on its slate tile.
 */
const BrandMark = () => (
  <svg className='ax-brand-mark' viewBox='0 0 512 512' aria-hidden='true'>
    <rect width='512' height='512' rx='112' fill={brand.slate} />
    <polygon
      fill='#fff'
      transform='translate(44.5 47.5) scale(1.986)'
      points='31,33 80,99 106,155 132,100 181,34 169,87 134,117 107,177 79,117 43,86'
    />
  </svg>
);

/**
 * Product name shown at the start of the header.
 */
const Brand = () => {
  const { t } = useTranslation();

  return (
    <div className='ax-brand'>
      <BrandMark />
      <span className='ax-brand-name'>
        Axio Control
        <small>{t('header.tagline')}</small>
      </span>
    </div>
  );
};

export default Brand;
