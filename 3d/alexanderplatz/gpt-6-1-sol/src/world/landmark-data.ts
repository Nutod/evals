import { project } from './geo';

export interface Landmark {
  id: string;
  name: string;
  category: string;
  year: string;
  height: number;
  lat: number;
  lon: number;
  description: string;
  position: [number, number];
  targetHeight: number;
  distance: number;
}

const places = [
  {
    id: 'tower',
    name: 'Fernsehturm',
    category: 'The city landmark',
    year: '1969',
    height: 368,
    lat: 52.520815,
    lon: 13.409419,
    targetHeight: 180,
    distance: 670,
    description:
      'A silver sphere above the city. At 368 metres, the television tower remains Berlin’s tallest structure and the unmistakable centre of its skyline.',
  },
  {
    id: 'park-inn',
    name: 'Park Inn',
    category: 'Modernist high-rise',
    year: '1970',
    height: 125,
    lat: 52.5229961,
    lon: 13.41272626,
    targetHeight: 55,
    distance: 360,
    description:
      'The former Hotel Stadt Berlin anchors the northern edge of the square. Its gridded glass facade rises 37 storeys above Alexanderplatz.',
  },
  {
    id: 'clock',
    name: 'Weltzeituhr',
    category: 'A place to meet',
    year: '1969',
    height: 10,
    lat: 52.521155,
    lon: 13.4134,
    targetHeight: 4,
    distance: 55,
    description:
      'Erich John’s Urania World Clock has been a meeting point since 1969. Its 24-sided drum brings the world’s time zones together beneath a moving solar system.',
  },
  {
    id: 'station',
    name: 'Bahnhof Alexanderplatz',
    category: 'The city in motion',
    year: '1882',
    height: 22,
    lat: 52.52153,
    lon: 13.41107,
    targetHeight: 10,
    distance: 310,
    description:
      'Brick viaducts and sweeping train-shed roofs carry the Stadtbahn across the square. Regional trains and the S-Bahn have crossed here for more than a century.',
  },
  {
    id: 'rathaus',
    name: 'Rotes Rathaus',
    category: 'Berlin’s city hall',
    year: '1869',
    height: 74,
    lat: 52.51863,
    lon: 13.40808,
    targetHeight: 30,
    distance: 300,
    description:
      'Named for its red-brick facade, Berlin’s city hall is arranged around three courtyards. Its clock tower takes its cues from the cathedral of Laon.',
  },
  {
    id: 'church',
    name: 'Marienkirche',
    category: 'The oldest layer',
    year: 'c. 1270',
    height: 90,
    lat: 52.520567,
    lon: 13.407359,
    targetHeight: 35,
    distance: 270,
    description:
      'St Mary’s Church preserves a much older Berlin beneath the modern skyline. Its brick Gothic nave and copper spire sit beside the television tower.',
  },
] as const;

export const LANDMARKS: Landmark[] = places.map((place) => ({
  ...place,
  position: project(place.lat, place.lon),
}));
