import { StyleGuide } from "@/redux/api/style-guide";

export const mockStyleGuide: StyleGuide = {
  theme: "Modern Minimalist",
  description:
    "A clean, modern theme with balanced contrast and ample white space — ideal for tech products, portfolios, and modern dashboards.",
  colorSection: [
    {
      title: "Primary Color",
      swatchs: [
        { name: "Primary Blue", hexColor: "#007BFF", description: "Brand primary color for buttons and highlights." },
        { name: "Dark Navy", hexColor: "#001F3F", description: "Used for headers and strong text elements." },
        { name: "Sky Blue", hexColor: "#74C0FC", description: "Soft hover state or background tint for cards." },
      ],
    },
    {
      title: "Secondary & Accent Color",
      swatchs: [
        { name: "Coral Pink", hexColor: "#FF6B6B", description: "Accent color for attention-grabbing UI elements." },
        { name: "Amber Yellow", hexColor: "#FFC107", description: "Used for warnings and visual contrast." },
        { name: "Mint Green", hexColor: "#37B24D", description: "Represents success or confirmation messages." },
        { name: "Purple Tint", hexColor: "#9775FA", description: "For highlights or brand personality touches." },
      ],
    },
    {
      title: "Utility & Form Color",
      swatchs: [
        { name: "Light Gray", hexColor: "#F1F3F5", description: "Background for cards and containers." },
        { name: "Medium Gray", hexColor: "#CED4DA", description: "Used for dividers and neutral borders." },
        { name: "Dark Gray", hexColor: "#495057", description: "Used for subtle text or muted icons." },
        { name: "Off White", hexColor: "#FAFAFA", description: "Soft background tone for light mode UIs." },
      ],
    },
    {
      title: "Status & Feedback Color",
      swatchs: [
        { name: "Error Red", hexColor: "#E03131", description: "Error states or destructive actions." },
        { name: "Warning Orange", hexColor: "#F08C00", description: "Used for alerts or caution messages." },
        { name: "Success Green", hexColor: "#2B8A3E", description: "Used for successful confirmations." },
        { name: "Info Blue", hexColor: "#228BE6", description: "For informational messages or tooltips." },
      ],
    },
  ],
  typographySection: [
    {
      title: "Headings",
      style: [
        {
          name: "Heading 1",
          fontFamily: "Poppins",
          fontSize: "36px",
          fontWeight: "700",
          lineWeight: "1.2",
          letterSpacing: "0",
          description: "Main page titles or hero text.",
        },
        {
          name: "Heading 2",
          fontFamily: "Poppins",
          fontSize: "28px",
          fontWeight: "600",
          lineWeight: "1.3",
          letterSpacing: "0.5",
          description: "Section titles and headers.",
        },
        {
          name: "Heading 3",
          fontFamily: "Poppins",
          fontSize: "22px",
          fontWeight: "500",
          lineWeight: "1.4",
          letterSpacing: "0.5",
          description: "Subheaders or feature titles.",
        },
      ],
    },
    {
      title: "Body Text",
      style: [
        {
          name: "Paragraph",
          fontFamily: "Inter",
          fontSize: "16px",
          fontWeight: "400",
          lineWeight: "1.5",
          letterSpacing: "0",
          description: "Used for standard text and descriptions.",
        },
        {
          name: "Small Text",
          fontFamily: "Inter",
          fontSize: "14px",
          fontWeight: "400",
          lineWeight: "1.4",
          letterSpacing: "0",
          description: "Used for footnotes and secondary info.",
        },
        {
          name: "Caption",
          fontFamily: "Inter",
          fontSize: "12px",
          fontWeight: "400",
          lineWeight: "1.3",
          letterSpacing: "0.2",
          description: "Used for subtle labels or meta text.",
        },
      ],
    },
    {
      title: "Buttons & UI",
      style: [
        {
          name: "Primary Button",
          fontFamily: "Inter",
          fontSize: "16px",
          fontWeight: "600",
          lineWeight: "1.2",
          letterSpacing: "0.5",
          description: "Used for main CTAs.",
        },
        {
          name: "Secondary Button",
          fontFamily: "Inter",
          fontSize: "15px",
          fontWeight: "500",
          lineWeight: "1.3",
          letterSpacing: "0.3",
          description: "Used for secondary actions.",
        },
        {
          name: "Tag / Chip",
          fontFamily: "Inter",
          fontSize: "13px",
          fontWeight: "500",
          lineWeight: "1.2",
          letterSpacing: "0.3",
          description: "Used for badges, tags, or filters.",
        },
      ],
    },
  ],
};






export const mockTypographyGuide = [
  {
    title: "Primary Fonts",
    style: [
      {
        name: "Heading 1",
        fontFamily: "Poppins",
        fontSize: "32px",
        fontWeight: "700",
        lineWeight: "40px",
        letterSpacing: "0.5px",
        description: "Used for primary headers and main titles.",
      },
      {
        name: "Body Text",
        fontFamily: "Inter",
        fontSize: "16px",
        fontWeight: "400",
        lineWeight: "24px",
        letterSpacing: "0px",
        description: "Used for paragraphs and general text.",
      },
    ],
  },
  {
    title: "Secondary Fonts",
    style: [
      {
        name: "Subheading",
        fontFamily: "Lora",
        fontSize: "20px",
        fontWeight: "600",
        lineWeight: "28px",
        letterSpacing: "0.3px",
        description: "Used for subtitles or section headings.",
      },
      {
        name: "Caption",
        fontFamily: "Roboto Mono",
        fontSize: "12px",
        fontWeight: "400",
        lineWeight: "16px",
        letterSpacing: "0.2px",
        description: "Used for image captions or footnotes.",
      },
    ],
  },
  {
    title: "Accent Fonts",
    style: [
      {
        name: "Quote",
        fontFamily: "Playfair Display",
        fontSize: "18px",
        fontWeight: "500",
        lineWeight: "26px",
        letterSpacing: "0.3px",
        description: "Used for quotes or highlighted text.",
      },
    ],
  },
];

