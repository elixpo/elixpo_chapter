export interface ColorSwatchs {
     name: string;
     hexColor: string;
     description?: string;
}
export interface ColorSection {
    title: 
    | 'Primary Color'
    | 'Secondary & Accent Color'
    | 'UI Component Color'
    | 'Utility & Form Color'
    | 'Status & Feedback Color'
  swatchs: ColorSwatchs[]
}



export interface TypographyStyle {
     name: string;
     fontFamily: string;
     fontSize: string;
     fontWeight: string;
     lineWeight: string;
     letterSpacing: string;
     description: string;
}

export interface TypographySection {
     title: string;
     style: TypographyStyle[]
}

export interface StyleGuide {
    theme: string;
    description: string;
    colorSection: [
        ColorSection,
        ColorSection,
        ColorSection,
        ColorSection
    ];
    typographySection: [TypographySection, TypographySection, TypographySection]
}