export const REGIONS = [
  {
    id: 'asia',
    label: 'Asie',
    order: 0,
    viewMode: 'single',
    points: [
      { name: 'Singapour', lat: 1.3521, lng: 103.8198 },
    ],
  },
  {
    id: 'brics-uk',
    label: 'BRICS + UK',
    order: 1,
    viewMode: 'bounds',
    points: [
      { name: 'Brésil', lat: -23.5505, lng: -46.6333 },
      { name: 'Russie', lat: 55.7558, lng: 37.6173 },
      { name: 'Inde', lat: 19.0760, lng: 72.8777 },
      { name: 'Chine', lat: 31.2304, lng: 121.4737 },
      { name: 'Afrique du Sud', lat: -26.2041, lng: 28.0473 },
      { name: 'Royaume-Uni', lat: 51.5074, lng: -0.1278 },
    ],
  },
  {
    id: 'europe',
    label: 'Europe',
    order: 2,
    viewMode: 'single',
    points: [
      { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    ],
  },
  {
    id: 'north-america',
    label: 'Amérique du Nord',
    order: 3,
    viewMode: 'single',
    points: [
      { name: 'New York', lat: 40.7128, lng: -74.0060 },
    ],
  },
];
