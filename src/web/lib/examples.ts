export const examples = [
  {
    slug: "alphabet",
    company: "Alphabet",
    years: "FY2021-FY2025",
    description: "Saved leadership research",
    monogram: "A",
  },
  {
    slug: "microsoft",
    company: "Microsoft",
    years: "FY2023-FY2025",
    description: "Annual report evidence",
    monogram: "M",
  },
] as const;
export const destinations = {
  home: "/",
  examples: "/#examples",
  alphabet: "/examples/alphabet",
  microsoft: "/examples/microsoft",
  research: "/#research",
} as const;
export type Destination = keyof typeof destinations;
