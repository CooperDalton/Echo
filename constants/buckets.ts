export const BUCKETS = [
  'Business Ideas',
  'Reflections',
  'Game Dev',
  'Family',
  'Systems',
] as const;

export type BucketName = (typeof BUCKETS)[number];

type BucketColor = {
  lightBg: string;
  lightBorder: string;
  lightText: string;
  darkBg: string;
  darkBorder: string;
  darkText: string;
};

export const BUCKET_COLORS: Record<BucketName, BucketColor> = {
  'Business Ideas': {
    lightBg: '#E8F6EC',
    lightBorder: '#B8E1C4',
    lightText: '#1E6B3C',
    darkBg: '#223629',
    darkBorder: '#32543E',
    darkText: '#A9E3BC',
  },
  Reflections: {
    lightBg: '#EAF1FD',
    lightBorder: '#C4D7FA',
    lightText: '#2B4D8C',
    darkBg: '#202D45',
    darkBorder: '#30476F',
    darkText: '#B8CCF3',
  },
  'Game Dev': {
    lightBg: '#F8EFFF',
    lightBorder: '#DEC9F7',
    lightText: '#6A3C9C',
    darkBg: '#372747',
    darkBorder: '#553A70',
    darkText: '#D8C1F2',
  },
  Family: {
    lightBg: '#FFF1E8',
    lightBorder: '#F2CFBB',
    lightText: '#8E5129',
    darkBg: '#402B1F',
    darkBorder: '#65422F',
    darkText: '#F0CBB2',
  },
  Systems: {
    lightBg: '#E8F7F6',
    lightBorder: '#B7E2DF',
    lightText: '#1F5F5A',
    darkBg: '#1F3735',
    darkBorder: '#2E5551',
    darkText: '#A8E2DD',
  },
};
