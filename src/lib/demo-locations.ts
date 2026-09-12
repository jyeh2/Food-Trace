export type RecordedLocation = {
  label: string;
  lat: number;
  lng: number;
};

export type DemoLocation = RecordedLocation & {
  id: string;
  category: "Farm" | "Processing" | "Distribution" | "Retail";
};

/** Recognizable stops for showing a complete journey from California to Pittsburgh. */
export const DEMO_LOCATIONS: DemoLocation[] = [
  {
    id: "earthbound-farm",
    category: "Farm",
    label: "Earthbound Farm, Carmel Valley, CA",
    lat: 36.4797,
    lng: -121.7328,
  },
  {
    id: "driscolls-watsonville",
    category: "Farm",
    label: "Driscoll's, Watsonville, CA",
    lat: 36.9102,
    lng: -121.7569,
  },
  {
    id: "salinas-processing",
    category: "Processing",
    label: "Salinas Produce Processing Center, CA",
    lat: 36.6777,
    lng: -121.6555,
  },
  {
    id: "oakland-distribution",
    category: "Distribution",
    label: "Port of Oakland Distribution Hub, CA",
    lat: 37.7955,
    lng: -122.2787,
  },
  {
    id: "pittsburgh-retail",
    category: "Retail",
    label: "Pittsburgh Community Market, PA",
    lat: 40.4406,
    lng: -79.9959,
  },
];

